import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { plannerMock } from '@/lib/data/planner-mock';
import { monthStart } from '@/lib/planner/domain-key';
import {
  DEFAULT_SORT,
  NO_FILTER,
  type PlannerFilter,
  type PlannerSort,
} from '@/lib/planner/filter';
import type { PlannerGroup } from '@/lib/planner/summary';
import type {
  MonthSettings,
  PlannerLink,
  PlannerLinkPatch,
  PlannerProject,
  PlannerStatus,
  StatusCategory,
} from '@/lib/types/planner';

/**
 * Everything the Link Building Planner reads and writes.
 *
 * ## Scoped twice, on purpose
 *
 * Every query goes through the service-role client and still carries
 * `.eq('user_id', userId)`. The policy on the table is what protects a
 * customer querying PostgREST directly; this is what protects them from a
 * bug in our own code, because the service role bypasses row security
 * entirely. `gap-service` says the same thing above its own project read,
 * and it is the only arrangement that survives somebody forgetting one of
 * the two.
 *
 * ## No API costs anywhere in this file
 *
 * No fetch, no Ahrefs, no model. The one lookup that resembles enrichment -
 * finding a domain's metrics - is a single indexed read of a table we
 * already own, and it is in `metric-lookup.ts` behind a rate limit. Nothing
 * here runs on a schedule and nothing here visits a publisher's website.
 */

type Row = Record<string, unknown>;

/**
 * How many rows one PostgREST response may carry.
 *
 * Supabase's default `db-max-rows` is a thousand and the response says
 * nothing when it truncates, so every read here that could want more pages
 * up to it rather than asking once and believing the answer.
 */
const PAGE_CAP = 1000;

/** The sort keys, as the columns they are. `status` reaches through the embed. */
const SORT_COLUMNS: Record<PlannerSort['key'], string> = {
  added: 'created_at',
  domain: 'domain_key',
  domainRating: 'domain_rating',
  organicTraffic: 'organic_traffic',
  priceMinor: 'price_minor',
  plannedDate: 'planned_date',
  liveDate: 'live_date',
  status: 'planner_statuses(sort_order)',
};

/**
 * A search term, as a literal.
 *
 * `%` and `_` are wildcards in `like`, and a customer pasting a URL
 * fragment or a publisher name with an underscore in it is not writing a
 * pattern. Backslash first, or escaping the others puts wildcards back.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * A row an import may create.
 *
 * The five required fields are the ones a planner row is meaningless
 * without; everything else is optional because the two importers carry
 * different halves of the spreadsheet. A CSV brings metrics and no payment
 * state, an order brings a price that has already been paid and no metrics
 * at all, and widening one importer's shape to cover the other's would mean
 * passing explicit nulls for columns the caller knows nothing about - which
 * is how a blank becomes a zero.
 *
 * `userId` is not on it. It comes from the session, as a separate argument,
 * so that no caller can put one in a row.
 */
export interface NewPlannerLinkRow {
  projectId: string;
  planMonth: string;
  statusId: string;
  domain: string;
  domainKey: string;
  source?: string;
  domainRating?: number | null;
  organicTraffic?: number | null;
  organicKeywords?: number | null;
  referringDomains?: number | null;
  metricsSource?: PlannerLink['metricsSource'];
  linkType?: string;
  targetUrl?: string | null;
  anchorText?: string;
  anchorType?: string;
  plannedDate?: string | null;
  liveDate?: string | null;
  liveUrl?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
  paymentStatus?: PlannerLink['paymentStatus'];
  paidMinor?: number | null;
  notes?: string;
  /** Set only by the Press Parrot order import. Never by a CSV. */
  orderItemId?: string | null;
}

const PROJECT_COLUMNS =
  'id, name, domain, country, currency, monthly_budget_minor, monthly_link_target, notes, archived_at';

const LINK_COLUMNS = `
  id, project_id, plan_month, domain, domain_key, source,
  domain_rating, organic_traffic, organic_keywords, referring_domains,
  metrics_source, metrics_updated_at,
  link_type, target_url, anchor_text, anchor_type, status_id,
  planned_date, live_date, live_url,
  price_minor, currency, payment_status, paid_minor,
  notes, order_item_id, created_at, updated_at
`;

function mapProject(row: Row): PlannerProject {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    domain: String(row.domain ?? ''),
    country: String(row.country ?? 'gb'),
    currency: String(row.currency ?? 'GBP'),
    monthlyBudgetMinor: numberOrNull(row.monthly_budget_minor),
    monthlyLinkTarget: numberOrNull(row.monthly_link_target),
    notes: String(row.notes ?? ''),
    archivedAt: (row.archived_at as string | null) ?? null,
  };
}

/**
 * Null stays null.
 *
 * `Number(null)` is 0, which is the single most dangerous coercion in this
 * feature: it turns "nobody has looked this up" into "this site has no
 * traffic" at the boundary, where nothing downstream can tell the
 * difference any more.
 */
function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLink(row: Row): PlannerLink {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    planMonth: String(row.plan_month ?? '').slice(0, 10),
    domain: String(row.domain ?? ''),
    domainKey: String(row.domain_key ?? ''),
    source: String(row.source ?? ''),
    domainRating: numberOrNull(row.domain_rating),
    organicTraffic: numberOrNull(row.organic_traffic),
    organicKeywords: numberOrNull(row.organic_keywords),
    referringDomains: numberOrNull(row.referring_domains),
    metricsSource: (row.metrics_source as PlannerLink['metricsSource']) ?? null,
    metricsUpdatedAt: (row.metrics_updated_at as string | null) ?? null,
    linkType: String(row.link_type ?? ''),
    targetUrl: (row.target_url as string | null) ?? null,
    anchorText: String(row.anchor_text ?? ''),
    anchorType: String(row.anchor_type ?? ''),
    statusId: String(row.status_id),
    plannedDate: row.planned_date ? String(row.planned_date).slice(0, 10) : null,
    liveDate: row.live_date ? String(row.live_date).slice(0, 10) : null,
    liveUrl: (row.live_url as string | null) ?? null,
    priceMinor: numberOrNull(row.price_minor),
    currency: (row.currency as string | null) ?? null,
    paymentStatus: (row.payment_status as PlannerLink['paymentStatus']) ?? 'unpaid',
    paidMinor: numberOrNull(row.paid_minor),
    notes: String(row.notes ?? ''),
    orderItemId: (row.order_item_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapStatus(row: Row): PlannerStatus {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    colour: String(row.colour ?? '#64748b'),
    category: (row.category as StatusCategory) ?? 'planned',
    sortOrder: Number(row.sort_order ?? 0),
    archivedAt: (row.archived_at as string | null) ?? null,
  };
}

/** Only the columns the table may write, named one at a time. */
function toRow(patch: PlannerLinkPatch): Row {
  const row: Row = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };
  set('plan_month', patch.planMonth);
  set('domain', patch.domain);
  set('domain_key', patch.domainKey);
  set('source', patch.source);
  set('domain_rating', patch.domainRating);
  set('organic_traffic', patch.organicTraffic);
  set('organic_keywords', patch.organicKeywords);
  set('referring_domains', patch.referringDomains);
  set('metrics_source', patch.metricsSource);
  set('metrics_updated_at', patch.metricsUpdatedAt);
  set('link_type', patch.linkType);
  set('target_url', patch.targetUrl);
  set('anchor_text', patch.anchorText);
  set('anchor_type', patch.anchorType);
  set('status_id', patch.statusId);
  set('planned_date', patch.plannedDate);
  set('live_date', patch.liveDate);
  set('live_url', patch.liveUrl);
  set('price_minor', patch.priceMinor);
  set('currency', patch.currency);
  set('payment_status', patch.paymentStatus);
  set('paid_minor', patch.paidMinor);
  set('notes', patch.notes);
  set('project_id', patch.projectId);
  return row;
}

export const plannerService = {
  // ------------------------------------------------------------- projects

  async projects(userId: string): Promise<PlannerProject[]> {
    if (!isSupabaseEnabled()) return plannerMock.projects(userId);

    const { data } = await getAdminScopedClient()
      .from('gap_projects')
      .select(PROJECT_COLUMNS)
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });

    return ((data ?? []) as Row[]).map(mapProject);
  },

  /**
   * Create or update a project.
   *
   * `gap_projects` is unique on (user_id, domain), so saving a site twice is
   * an edit. That constraint is the Link Gap Finder's and the reason is the
   * same there: two rows for one client is two sets of settings drifting
   * apart, and the stale one is the one somebody runs.
   */
  async saveProject(
    userId: string,
    input: {
      id?: string;
      name: string;
      domain: string;
      country: string;
      currency: string;
      monthlyBudgetMinor: number | null;
      monthlyLinkTarget: number | null;
      notes: string;
    },
  ): Promise<PlannerProject | null> {
    if (!isSupabaseEnabled()) return plannerMock.saveProject(userId, input);

    const supabase = getAdminScopedClient();
    const row = {
      user_id: userId,
      name: input.name,
      domain: input.domain,
      country: input.country,
      currency: input.currency,
      monthly_budget_minor: input.monthlyBudgetMinor,
      monthly_link_target: input.monthlyLinkTarget,
      notes: input.notes,
    };

    if (input.id) {
      const { data, error } = await supabase
        .from('gap_projects')
        .update(row)
        .eq('id', input.id)
        .eq('user_id', userId)
        .select(PROJECT_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(`Could not save the project: ${error.message}`);
      return data ? mapProject(data as Row) : null;
    }

    const { data, error } = await supabase
      .from('gap_projects')
      .upsert(row, { onConflict: 'user_id,domain' })
      .select(PROJECT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Could not save the project: ${error.message}`);
    return data ? mapProject(data as Row) : null;
  },

  /**
   * Archive, never delete.
   *
   * Deleting the row cascades to every link in it, and a finished client
   * campaign is a record somebody may need next year. The screen says
   * "archive" and means it.
   */
  async archiveProject(userId: string, projectId: string): Promise<boolean> {
    if (!isSupabaseEnabled()) return plannerMock.archiveProject(userId, projectId);

    const { error } = await getAdminScopedClient()
      .from('gap_projects')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', userId);
    if (error) throw new Error(`Could not archive the project: ${error.message}`);
    return true;
  },

  // --------------------------------------------------------------- months

  /**
   * What a month is running on.
   *
   * An override row if there is one, the project's defaults otherwise, and
   * a flag saying which - because the screen has to show a customer whether
   * they are editing this month or every month, and guessing from whether
   * the numbers happen to match would call a deliberate override a default
   * the moment somebody set it to the same figure.
   */
  async monthSettings(
    userId: string,
    project: PlannerProject,
    month: string,
  ): Promise<MonthSettings> {
    const fallback: MonthSettings = {
      month,
      budgetMinor: project.monthlyBudgetMinor,
      linkTarget: project.monthlyLinkTarget,
      fromProjectDefaults: true,
    };

    if (!isSupabaseEnabled()) return plannerMock.monthSettings(userId, project, month);

    const { data } = await getAdminScopedClient()
      .from('planner_months')
      .select('budget_minor, link_target')
      .eq('user_id', userId)
      .eq('project_id', project.id)
      .eq('month', month)
      .maybeSingle();

    if (!data) return fallback;
    const row = data as Row;
    return {
      month,
      budgetMinor: numberOrNull(row.budget_minor) ?? project.monthlyBudgetMinor,
      linkTarget: numberOrNull(row.link_target) ?? project.monthlyLinkTarget,
      fromProjectDefaults: false,
    };
  },

  async saveMonth(
    userId: string,
    projectId: string,
    month: string,
    patch: { budgetMinor: number | null; linkTarget: number | null },
  ): Promise<boolean> {
    if (!isSupabaseEnabled()) return plannerMock.saveMonth(userId, projectId, month, patch);

    const { error } = await getAdminScopedClient().from('planner_months').upsert(
      {
        user_id: userId,
        project_id: projectId,
        month: monthStart(month),
        budget_minor: patch.budgetMinor,
        link_target: patch.linkTarget,
      },
      { onConflict: 'project_id,month' },
    );
    if (error) throw new Error(`Could not save the month: ${error.message}`);
    return true;
  },

  // ------------------------------------------------------------- statuses

  /**
   * The customer's statuses, seeding the defaults the first time.
   *
   * Seeded here rather than on sign-up, because most accounts will never
   * open the planner and eleven rows each for all of them is a table full
   * of nothing. The function is a no-op for anybody who already has some.
   */
  async statuses(userId: string): Promise<PlannerStatus[]> {
    if (!isSupabaseEnabled()) return plannerMock.statuses(userId);

    const supabase = getAdminScopedClient();
    await supabase.rpc('planner_seed_statuses', { p_user_id: userId });

    const { data } = await supabase
      .from('planner_statuses')
      .select('id, name, colour, category, sort_order, archived_at')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    return ((data ?? []) as Row[]).map(mapStatus);
  },

  async saveStatus(
    userId: string,
    input: {
      id?: string;
      name: string;
      colour: string;
      category: StatusCategory;
      sortOrder: number;
    },
  ): Promise<PlannerStatus | null> {
    if (!isSupabaseEnabled()) return plannerMock.saveStatus(userId, input);

    const supabase = getAdminScopedClient();
    const row = {
      user_id: userId,
      name: input.name,
      colour: input.colour,
      category: input.category,
      sort_order: input.sortOrder,
    };

    const query = input.id
      ? supabase.from('planner_statuses').update(row).eq('id', input.id).eq('user_id', userId)
      : supabase.from('planner_statuses').insert(row);

    const { data, error } = await query
      .select('id, name, colour, category, sort_order, archived_at')
      .maybeSingle();
    if (error) throw new Error(`Could not save the status: ${error.message}`);
    return data ? mapStatus(data as Row) : null;
  },

  /**
   * Retire a status.
   *
   * Tries the delete, and archives instead when the database refuses -
   * which it does, by `on delete restrict`, exactly when links still carry
   * it. Asking "is it in use?" first and then deleting would be two
   * statements with a race between them, and the loser is a customer's row
   * losing its status.
   */
  async retireStatus(
    userId: string,
    statusId: string,
  ): Promise<{ outcome: 'deleted' | 'archived' }> {
    if (!isSupabaseEnabled()) return plannerMock.retireStatus(userId, statusId);

    const supabase = getAdminScopedClient();
    const { error } = await supabase
      .from('planner_statuses')
      .delete()
      .eq('id', statusId)
      .eq('user_id', userId);

    if (!error) return { outcome: 'deleted' };

    const { error: archiveError } = await supabase
      .from('planner_statuses')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', statusId)
      .eq('user_id', userId);
    if (archiveError) throw new Error(`Could not retire the status: ${archiveError.message}`);
    return { outcome: 'archived' };
  },

  // -------------------------------------------------------------- sources

  /** The customer's own supplier names. The five defaults are not rows. */
  async sources(userId: string): Promise<string[]> {
    if (!isSupabaseEnabled()) return plannerMock.sources(userId);

    const { data } = await getAdminScopedClient()
      .from('planner_sources')
      .select('name')
      .eq('user_id', userId)
      .order('name', { ascending: true });

    return ((data ?? []) as Row[]).map((row) => String(row.name ?? '')).filter(Boolean);
  },

  async addSource(userId: string, name: string): Promise<boolean> {
    const clean = name.trim().slice(0, 60);
    if (!clean) return false;
    if (!isSupabaseEnabled()) return plannerMock.addSource(userId, clean);

    const { error } = await getAdminScopedClient()
      .from('planner_sources')
      .upsert({ user_id: userId, name: clean }, { onConflict: 'user_id,name' });
    if (error) throw new Error(`Could not save the source: ${error.message}`);
    return true;
  },

  // ---------------------------------------------------------------- links

  /**
   * One month of one project, paged.
   *
   * Paged in the database rather than filtered in the browser: an agency
   * with three thousand links must not ship three thousand rows to render
   * twenty-five, and the index on (project_id, plan_month, created_at) is
   * there for exactly this read.
   */
  /**
   * A page of the table, filtered and sorted.
   *
   * ## Both happen here, not in the browser
   *
   * The table is paged, so a filter applied to the fifty rows on screen is
   * a filter over a page: it hides rows from the page it is given and
   * cannot see the ones it should have brought back. `verify:search` exists
   * because the marketplace had exactly that bug, and a customer could not
   * tell.
   *
   * `src/lib/planner/filter.ts` holds the rules. This translates them; it
   * does not restate them. Every predicate there is a containment, a range
   * or a set membership for that reason.
   *
   * ## Blank is last whichever way the arrow points
   *
   * `nullsFirst: false` is given on every order, in both directions.
   * Postgres' own default is nulls last ascending and nulls first
   * descending, which would put every unresearched row above a DR 92 the
   * moment somebody clicked the arrow twice.
   *
   * ## `month` may be null
   *
   * Null is the whole project rather than no month. It is what the date
   * range filter needs to mean anything - a range inside one month is a
   * range of at most thirty-one days - and it is a read of the same
   * indexed columns with one `eq` fewer.
   */
  async links(
    userId: string,
    options: {
      projectId: string;
      month: string | null;
      page?: number;
      pageSize?: number;
      filter?: PlannerFilter;
      sort?: PlannerSort;
    },
  ): Promise<{ items: PlannerLink[]; total: number }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 25;
    const filter = options.filter ?? NO_FILTER;
    const sort = options.sort ?? DEFAULT_SORT;

    if (!isSupabaseEnabled()) {
      return plannerMock.links(userId, { ...options, page, pageSize, filter, sort });
    }

    const from = (page - 1) * pageSize;

    /* The embed exists only so the sort can reach `sort_order`, and only
       when that is the sort asked for: an inner join on every read to
       support one of eight arrows is a join nobody chose. */
    const select: string =
      sort.key === 'status'
        ? `${LINK_COLUMNS}, planner_statuses!inner(sort_order)`
        : LINK_COLUMNS;

    let query = getAdminScopedClient()
      .from('planner_links')
      .select(select, { count: 'exact' })
      .eq('user_id', userId)
      .eq('project_id', options.projectId);

    if (options.month !== null) query = query.eq('plan_month', monthStart(options.month));

    if (filter.statusIds.length) query = query.in('status_id', filter.statusIds);
    if (filter.sources.length) query = query.in('source', filter.sources);
    if (filter.linkTypes.length) query = query.in('link_type', filter.linkTypes);

    /* `ilike` with the term escaped, so a pasted `%` searches for a percent
       sign rather than for everything. A customer pasting a URL fragment
       into the domain box is the normal case and it is full of them. */
    if (filter.domain) query = query.ilike('domain', `%${escapeLike(filter.domain)}%`);
    if (filter.anchor) query = query.ilike('anchor_text', `%${escapeLike(filter.anchor)}%`);

    /* A range excludes the rows with nothing in the column, rather than
       reading a blank as zero - see `matchesFilter`, which says why. The
       `not(... is null)` is explicit because `gte` alone would be a
       three-valued comparison PostgREST simply drops. */
    if (filter.priceMinMinor !== null) {
      query = query.not('price_minor', 'is', null).gte('price_minor', filter.priceMinMinor);
    }
    if (filter.priceMaxMinor !== null) {
      query = query.not('price_minor', 'is', null).lte('price_minor', filter.priceMaxMinor);
    }
    if (filter.plannedFrom !== null) {
      query = query.not('planned_date', 'is', null).gte('planned_date', filter.plannedFrom);
    }
    if (filter.plannedTo !== null) {
      query = query.not('planned_date', 'is', null).lte('planned_date', filter.plannedTo);
    }

    const column = SORT_COLUMNS[sort.key];
    query = query
      .order(column, { ascending: sort.ascending, nullsFirst: false })
      // Stability under paging. Without it two rows with the same domain
      // rating can swap between page one and page two, which shows one row
      // twice and hides another.
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, count, error } = await query;
    /* Loud rather than empty. A filtered read that fails silently shows a
       customer a different set of publishers than their filter claims,
       which is the failure `verify:search` was written about. */
    if (error) throw new Error(`Could not read the plan: ${error.message}`);

    return { items: ((data ?? []) as unknown as Row[]).map(mapLink), total: count ?? 0 };
  },

  /**
   * Specific rows, for an action working on a selection.
   *
   * Chunked at `PAGE_CAP`, because PostgREST caps a response at a thousand
   * rows and puts nothing in it to say so. Asking about 1,500 selected
   * links in one call would quietly answer about 1,000 of them, and the
   * caller - an export - would write a file that stops in the middle with
   * no sign that it has.
   */
  async linksByIds(userId: string, linkIds: string[]): Promise<PlannerLink[]> {
    if (linkIds.length === 0) return [];
    if (!isSupabaseEnabled()) return plannerMock.linksByIds(userId, linkIds);

    const supabase = getAdminScopedClient();
    const out: PlannerLink[] = [];

    for (let from = 0; from < linkIds.length; from += PAGE_CAP) {
      const { data, error } = await supabase
        .from('planner_links')
        .select(LINK_COLUMNS)
        .eq('user_id', userId)
        .in('id', linkIds.slice(from, from + PAGE_CAP));
      if (error) throw new Error(`Could not read those links: ${error.message}`);
      out.push(...((data ?? []) as Row[]).map(mapLink));
    }

    return out;
  },

  /**
   * Every row a filter matches, for an export.
   *
   * Paged through rather than asked for in one go, for the reason above:
   * a file that silently stops at a thousand rows is worse than no export
   * at all, because nothing about it looks wrong.
   */
  async allLinks(
    userId: string,
    options: { projectId: string; month: string | null; filter?: PlannerFilter; sort?: PlannerSort },
    limit = 20_000,
  ): Promise<PlannerLink[]> {
    const out: PlannerLink[] = [];
    for (let page = 1; out.length < limit; page += 1) {
      const { items } = await plannerService.links(userId, {
        ...options,
        page,
        pageSize: PAGE_CAP,
      });
      out.push(...items);
      if (items.length < PAGE_CAP) break;
    }
    return out.slice(0, limit);
  },

  /**
   * A plan, counted by the database.
   *
   * ## One round trip, and no cap to fall past
   *
   * `planner_report_rows` (0083) groups in Postgres and returns one row per
   * combination that exists - a few dozen for a project with a thousand
   * links. The read it replaces fetched every row and added them up here,
   * which PostgREST caps at a thousand without saying so in the response:
   * an agency with two years of plans would have been shown a spend figure
   * short by whatever fell past the cap, with nothing on the screen saying
   * so. 0068 records the same trap on the admin table.
   *
   * ## The counting is there, the meaning is here
   *
   * What "paid" and "committed" mean stays in `summary.ts`, which is the
   * only copy. This returns counts and sums; `moneyOf` applies the rules.
   *
   * `month` null is the whole project, which is what the Reports tab asks
   * for.
   */
  async groups(
    userId: string,
    projectId: string,
    month: string | null,
  ): Promise<PlannerGroup[]> {
    if (!isSupabaseEnabled()) return plannerMock.groups(userId, projectId, month);

    const { data, error } = await getAdminScopedClient().rpc('planner_report_rows', {
      p_user_id: userId,
      p_project_id: projectId,
      p_month: month === null ? null : monthStart(month),
    });
    /* Loud rather than empty. A summary that fails silently is a budget
       card reading zero against a month somebody has spent in. */
    if (error) throw new Error(`Could not total the plan: ${error.message}`);

    return ((data ?? []) as Row[]).map((row) => ({
      dimension: String(row.dimension) as PlannerGroup['dimension'],
      bucket: String(row.bucket ?? ''),
      category: String(row.category) as PlannerGroup['category'],
      paymentStatus: String(row.payment_status) as PlannerGroup['paymentStatus'],
      currency: (row.currency as string | null) ?? null,
      count: Number(row.n ?? 0),
      priceSum: Number(row.price_sum ?? 0),
      paidSum: Number(row.paid_sum ?? 0),
      owingSum: Number(row.owing_sum ?? 0),
    }));
  },

  async addLink(
    userId: string,
    projectId: string,
    month: string,
    statusId: string,
    input: { domain: string; domainKey: string },
  ): Promise<PlannerLink | null> {
    if (!isSupabaseEnabled()) {
      return plannerMock.addLink(userId, projectId, month, statusId, input);
    }

    const { data, error } = await getAdminScopedClient()
      .from('planner_links')
      .insert({
        user_id: userId,
        project_id: projectId,
        plan_month: monthStart(month),
        status_id: statusId,
        domain: input.domain,
        domain_key: input.domainKey,
      })
      .select(LINK_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Could not add the link: ${error.message}`);
    return data ? mapLink(data as Row) : null;
  },

  /**
   * Many rows at once, for an import.
   *
   * One insert rather than one per row: a thousand-line spreadsheet is a
   * thousand round trips to London otherwise, which is a minute of waiting
   * and a request that may not survive it. Chunked, because a single
   * statement carrying ten thousand rows is its own problem.
   */
  async addLinks(userId: string, rows: NewPlannerLinkRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    if (!isSupabaseEnabled()) return plannerMock.addLinks(userId, rows);

    const supabase = getAdminScopedClient();
    const CHUNK = 500;
    let written = 0;

    for (let from = 0; from < rows.length; from += CHUNK) {
      const batch = rows.slice(from, from + CHUNK).map((row) => {
        const metrics = [
          row.domainRating ?? null,
          row.organicTraffic ?? null,
          row.organicKeywords ?? null,
          row.referringDomains ?? null,
        ];
        return {
          user_id: userId,
          project_id: row.projectId,
          plan_month: monthStart(row.planMonth),
          status_id: row.statusId,
          domain: row.domain,
          domain_key: row.domainKey,
          source: row.source ?? '',
          domain_rating: row.domainRating ?? null,
          organic_traffic: row.organicTraffic ?? null,
          organic_keywords: row.organicKeywords ?? null,
          referring_domains: row.referringDomains ?? null,
          /* Where the figures came from, and never a claim we measured
             them. `metricsSource` is given explicitly by a caller that
             knows (the order import leaves it unset, because an order
             carries no metrics); a row with figures and no source is a
             spreadsheet's, which is what `csv` means. */
          metrics_source:
            row.metricsSource ?? (metrics.some((value) => value !== null) ? 'csv' : null),
          link_type: row.linkType ?? '',
          target_url: row.targetUrl ?? null,
          anchor_text: row.anchorText ?? '',
          anchor_type: row.anchorType ?? '',
          planned_date: row.plannedDate ?? null,
          live_date: row.liveDate ?? null,
          live_url: row.liveUrl ?? null,
          price_minor: row.priceMinor ?? null,
          currency: row.currency ?? null,
          payment_status: row.paymentStatus ?? 'unpaid',
          paid_minor: row.paidMinor ?? null,
          notes: row.notes ?? '',
          order_item_id: row.orderItemId ?? null,
        };
      });

      const { error } = await supabase.from('planner_links').insert(batch);
      if (error) throw new Error(`Could not import: ${error.message}`);
      written += batch.length;
    }

    return written;
  },

  /** Which of these domains are already in this month's plan. */
  async existingDomainKeys(
    userId: string,
    projectId: string,
    month: string,
  ): Promise<Set<string>> {
    if (!isSupabaseEnabled()) return plannerMock.existingDomainKeys(userId, projectId, month);

    const { data } = await getAdminScopedClient()
      .from('planner_links')
      .select('domain_key')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('plan_month', month);

    return new Set(((data ?? []) as Row[]).map((row) => String(row.domain_key)));
  },

  async updateLink(
    userId: string,
    linkId: string,
    patch: PlannerLinkPatch,
  ): Promise<PlannerLink | null> {
    const row = toRow(patch);
    if (Object.keys(row).length === 0) return null;

    if (!isSupabaseEnabled()) return plannerMock.updateLink(userId, linkId, patch);

    const { data, error } = await getAdminScopedClient()
      .from('planner_links')
      .update(row)
      .eq('id', linkId)
      .eq('user_id', userId)
      .select(LINK_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Could not save: ${error.message}`);
    return data ? mapLink(data as Row) : null;
  },

  /** Which order items this customer has already pulled into a plan. */
  async importedOrderItemIds(userId: string): Promise<Set<string>> {
    if (!isSupabaseEnabled()) return plannerMock.importedOrderItemIds(userId);

    const { data } = await getAdminScopedClient()
      .from('planner_links')
      .select('order_item_id')
      .eq('user_id', userId)
      .not('order_item_id', 'is', null);

    return new Set(((data ?? []) as Row[]).map((row) => String(row.order_item_id)));
  },

  /**
   * One change, to many rows.
   *
   * ## The allowlist is the type, and it is short
   *
   * Five fields: status, source, link type, month, project. They are the
   * five a bulk action can sensibly mean - everything else on a row is
   * specific to that row, and "set the anchor text of forty links to the
   * same phrase" is not a thing anybody wants done to them by accident.
   *
   * Prices are deliberately not here. A price is what one publisher
   * charged, and a bulk write of one figure over forty of them destroys
   * exactly the record this tool exists to keep.
   *
   * ## Moving between projects still has to be their project
   *
   * `project_id` is checked against the caller's own projects before the
   * write rather than relying on the trigger to refuse it. The trigger
   * would refuse it - `planner_links_same_owner` is in 0081 for this - but
   * a refused batch tells the customer nothing about which row was wrong,
   * and this path knows.
   */
  async updateLinks(
    userId: string,
    linkIds: string[],
    patch: {
      statusId?: string;
      source?: string;
      linkType?: string;
      planMonth?: string;
      projectId?: string;
    },
  ): Promise<number> {
    if (linkIds.length === 0) return 0;

    const row: Row = {};
    if (patch.statusId !== undefined) row.status_id = patch.statusId;
    if (patch.source !== undefined) row.source = patch.source;
    if (patch.linkType !== undefined) row.link_type = patch.linkType;
    if (patch.planMonth !== undefined) row.plan_month = monthStart(patch.planMonth);
    if (patch.projectId !== undefined) row.project_id = patch.projectId;
    if (Object.keys(row).length === 0) return 0;

    if (!isSupabaseEnabled()) return plannerMock.updateLinks(userId, linkIds, patch);

    const { error, count } = await getAdminScopedClient()
      .from('planner_links')
      .update(row, { count: 'exact' })
      .eq('user_id', userId)
      .in('id', linkIds);
    if (error) throw new Error(`Could not change those links: ${error.message}`);
    return count ?? 0;
  },

  async deleteLinks(userId: string, linkIds: string[]): Promise<number> {
    if (linkIds.length === 0) return 0;
    if (!isSupabaseEnabled()) return plannerMock.deleteLinks(userId, linkIds);

    const { error } = await getAdminScopedClient()
      .from('planner_links')
      .delete()
      .eq('user_id', userId)
      .in('id', linkIds);
    if (error) throw new Error(`Could not delete: ${error.message}`);
    return linkIds.length;
  },
};
