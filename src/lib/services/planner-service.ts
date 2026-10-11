import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { plannerMock } from '@/lib/data/planner-mock';
import { monthStart } from '@/lib/planner/domain-key';
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
  async links(
    userId: string,
    projectId: string,
    month: string,
    page = 1,
    pageSize = 25,
  ): Promise<{ items: PlannerLink[]; total: number }> {
    if (!isSupabaseEnabled()) return plannerMock.links(userId, projectId, month, page, pageSize);

    const from = (page - 1) * pageSize;
    const { data, count } = await getAdminScopedClient()
      .from('planner_links')
      .select(LINK_COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('plan_month', month)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    return { items: ((data ?? []) as Row[]).map(mapLink), total: count ?? 0 };
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
