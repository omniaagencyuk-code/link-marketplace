import { cache } from 'react';
import { getServerClient, getAdminClient, getAdminScopedClient } from '@/lib/supabase/server';
import { inNiche } from '@/lib/marketplace/topic';
import { readAllPages } from './paged';
import {
  COST_CURRENCY_MESSAGE,
  costCurrencyBlocker,
  usableCurrency,
  writesACost,
} from '@/lib/websites/cost-currency';
import {
  WEBSITE_SELECT,
  WEBSITE_SELECT_ADMIN,
  mapWebsite,
  websiteToRow,
  type WebsiteRow,
} from '@/lib/supabase/mappers';
import { toListItem } from '../query-engine';
import { toPreviewRows, type MarketplacePreview } from '../marketplace-preview';
import { normaliseDomain } from '@/lib/import/normalise';
import { newWebsiteDefaults, toWebsitePatch } from '@/lib/import/to-website';
import { slugifyDomain } from '@/lib/utils/format';
import { candidatesPerSide, rankRelated, relatedTarget } from '@/lib/websites/related';
import type { ImportBatchResult, ImportPayloadRow, DuplicateMode } from '@/lib/import/types';
import type {
  NichePrice,
  NicheSlug,
  Service,
  Website,
  WebsiteListItem,
  WebsiteStatus,
} from '@/lib/types';
import type { MarketplaceFacets, PaginatedResult, WebsiteQuery } from '@/lib/types/query';

/**
 * Websites, backed by Supabase.
 *
 * Public reads go through the *user's* client, so row level security decides
 * what comes back: a signed-out request sees nothing, which is the gating
 * working rather than a bug to route around. `getPublicPreview` and
 * `getStats` are the exceptions that serve signed-out pages, and both return
 * aggregates or redacted rows, never a domain.
 *
 * Everything the admin area calls uses `getAdminScopedClient()` instead,
 * because the admin holds no Supabase identity - see that function's comment.
 * Each of those methods is only ever reached from behind
 * `requireAdminSession()`.
 */

/**
 * How many listings the marketplace ships to the browser comfortably.
 *
 * The marketplace filters client-side over the whole dataset, which is fast
 * and keeps the UI instant, but it does mean the page carries every active
 * listing. That is fine into the low thousands and wrong beyond it. When the
 * inventory outgrows this, `search()` below is the replacement: it already
 * pushes filtering into the database.
 *
 * It is not a query limit, and the distinction is the whole of this change.
 * It used to be one - `.limit(2000)` on four reads here - and PostgREST
 * answered every one of them with a thousand rows and no error, so the admin
 * table counted a thousand websites against a larger inventory, the
 * marketplace showed buyers the strongest thousand and hid the rest, and the
 * homepage niche cards were counted from the same truncated array. The reads
 * page now; this is only the number at which somebody should be told the
 * design has been outgrown.
 */
const COMFORTABLE_LIST_SIZE = 5000;

/**
 * Says so when a full read has outgrown the design that ships it whole.
 *
 * Deliberately not a cap. Truncating here would put back the exact bug this
 * change removes, at a number chosen by us instead of by PostgREST. The page
 * stays correct and gets slow, and the log says the marketplace needs to
 * start filtering in the database.
 */
function warnIfOutgrown(what: string, rows: number) {
  if (rows <= COMFORTABLE_LIST_SIZE) return;
  console.warn(
    `${what} returned ${rows} rows, past the ${COMFORTABLE_LIST_SIZE} this page ` +
      'ships to the browser comfortably. Move it onto the database-side search.',
  );
}


/**
 * A website is three tables, not one.
 *
 * `websiteToRow` maps the columns that live on `websites`. Niches live in a
 * join table, services in their own table and our buy price in a third, so a
 * save that only wrote the first one lost the price and the niche silently -
 * the record saved, the listing was wrong, and nothing said so. These
 * functions write the other two, and are called from both create and update.
 */

type Client = ReturnType<typeof getAdminScopedClient>;

/** Primary or secondary - the same test the marketplace filter applies. */
/** Primary or secondary. Shared with the niche pages, which must agree. */
const matchesNiche = (website: WebsiteListItem, niche: NicheSlug): boolean =>
  inNiche(website, niche);

/** Category ids for a set of slugs, in one query. */
async function categoryIds(supabase: Client, slugs: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(slugs.filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const { data } = await supabase.from('categories').select('id, slug').in('slug', wanted);
  return new Map(((data ?? []) as { id: string; slug: string }[]).map((row) => [row.slug, row.id]));
}

async function syncCategories(
  supabase: Client,
  websiteId: string,
  /**
   * `undefined` leaves the primary category alone; `null` clears it.
   *
   * The distinction was already load-bearing and is now reachable: a listing
   * can legitimately have no category, so an editor saving one has to be
   * able to say so. The body below already wrote null for a falsy slug - only
   * the type refused to let one through.
   */
  niche: string | null | undefined,
  secondary: string[] | undefined,
) {
  // An update that touches neither must not clear what is already there.
  if (niche === undefined && secondary === undefined) return;

  const ids = await categoryIds(supabase, [...(niche ? [niche] : []), ...(secondary ?? [])]);

  if (niche !== undefined) {
    /*
      Ternary, not `(niche && ids.get(niche)) ?? null`.

      That reads correctly and is wrong: `'' && …` short-circuits to `''`,
      and `?? ` only catches null and undefined - so the empty string the
      admin form sends for "Not categorised" would have been written into
      `primary_category_id` as an empty uuid rather than a null.
    */
    const primaryId = niche ? (ids.get(niche) ?? null) : null;
    await supabase.from('websites').update({ primary_category_id: primaryId }).eq('id', websiteId);
  }

  // The join table is replaced wholesale: it is small, and a diff would be
  // more code than it is worth for a handful of rows.
  await supabase.from('website_categories').delete().eq('website_id', websiteId);

  const rows = [
    ...(niche && ids.get(niche)
      ? [{ website_id: websiteId, category_id: ids.get(niche)!, is_primary: true }]
      : []),
    ...(secondary ?? [])
      .filter((slug) => slug !== niche && ids.has(slug))
      .map((slug) => ({ website_id: websiteId, category_id: ids.get(slug)!, is_primary: false })),
  ];

  if (rows.length) await supabase.from('website_categories').insert(rows);
}

async function syncServices(
  supabase: Client,
  websiteId: string,
  services: Service[] | undefined,
  updatedBy?: string,
) {
  if (services === undefined) return;

  const keep = services.map((service) => service.type);

  // Remove the types that are no longer offered. Untick guest post and the
  // guest post service goes, along with its cost row via the cascade.
  const removal = supabase.from('services').delete().eq('website_id', websiteId);
  await (keep.length ? removal.not('type', 'in', `(${keep.join(',')})`) : removal);

  if (services.length === 0) return;

  const { data, error } = await supabase
    .from('services')
    .upsert(
      services.map((service) => ({
        website_id: websiteId,
        type: service.type,
        price_minor: Math.max(0, Math.round(service.priceMinor)),
        turnaround_min_days: service.turnaroundMinDays,
        turnaround_max_days: service.turnaroundMaxDays,
        available: service.available,
        note: service.note ?? null,
      })),
      { onConflict: 'website_id,type' },
    )
    .select('id, type');

  if (error) throw new Error(`Failed to save services: ${error.message}`);

  const idByType = new Map(((data ?? []) as { id: string; type: string }[]).map((r) => [r.type, r.id]));

  // Costs are ours, not the publisher's, so they live in their own table and
  // are written separately. An undefined cost means "not recorded" and clears
  // any previous figure rather than storing a misleading zero.
  const withCost = services.filter((service) => typeof service.costPriceMinor === 'number');
  const withoutCost = services.filter((service) => typeof service.costPriceMinor !== 'number');

  const clearIds = withoutCost.map((s) => idByType.get(s.type)).filter(Boolean) as string[];
  if (clearIds.length) await supabase.from('service_costs').delete().in('service_id', clearIds);

  const costRows = withCost
    .map((service) => {
      const id = idByType.get(service.type);
      if (!id) return null;
      return {
        service_id: id,
        cost_price_minor: Math.max(0, Math.round(service.costPriceMinor!)),
        updated_by: updatedBy ?? null,
      };
    })
    .filter(Boolean) as { service_id: string; cost_price_minor: number; updated_by: string | null }[];

  if (costRows.length) {
    await supabase.from('service_costs').upsert(costRows, { onConflict: 'service_id' });
  }
}

/**
 * Price overrides, replaced wholesale.
 *
 * Deleting first is what makes removal work: an upsert alone would leave a
 * row for a niche the publisher no longer prices differently, and the listing
 * would go on quoting a premium nobody agreed to. A handful of rows per site
 * makes a diff more code than it is worth.
 */
async function syncNichePrices(
  supabase: Client,
  websiteId: string,
  prices: NichePrice[] | undefined,
  updatedBy?: string,
) {
  // An update that does not mention them must not clear them.
  if (prices === undefined) return;

  await supabase.from('website_niche_prices').delete().eq('website_id', websiteId);

  const rows = prices
    .filter((price) => price.priceMinor > 0)
    .map((price) => ({
      website_id: websiteId,
      niche: price.niche,
      link_type: price.linkType,
      price_minor: Math.round(price.priceMinor),
      updated_by: updatedBy ?? null,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase
    .from('website_niche_prices')
    .upsert(rows, { onConflict: 'website_id,niche,link_type' });

  if (error) throw new Error(`Failed to save niche prices: ${error.message}`);
}

/**
 * Publisher contact details, written to their own table.
 *
 * Deleted rather than blanked when an admin clears every field, so "no
 * contact recorded" is the absence of a row rather than a row of empty
 * strings - which is what the admin list means when it says a website has no
 * contact yet.
 */
async function syncContact(
  supabase: Client,
  websiteId: string,
  contact: Website['contact'],
  updatedBy?: string,
) {
  // An update that does not mention it must not clear it.
  if (contact === undefined) return;

  const email = contact.email?.trim() ?? '';
  const name = contact.name?.trim() ?? '';
  const notes = contact.notes?.trim() ?? '';

  if (!email && !name && !notes) {
    await supabase.from('website_contacts').delete().eq('website_id', websiteId);
    return;
  }

  const { error } = await supabase.from('website_contacts').upsert(
    {
      website_id: websiteId,
      email: email || null,
      contact_name: name || null,
      notes: notes || null,
      updated_by: updatedBy ?? null,
    },
    { onConflict: 'website_id' },
  );

  if (error) throw new Error(`Failed to save the publisher contact: ${error.message}`);
}

/**
 * The publisher's currency, written to the commercial terms table.
 *
 * It lives there rather than beside the cost because a publisher quotes
 * everything in one currency - but until now nothing in the admin could set
 * it. Only the email extraction wrote it, so a listing whose currency was
 * read wrong, or never stated, could not be corrected from a browser. That is
 * the whole reason a dollar cost sat on screen labelled as pounds.
 *
 * Upserted rather than updated: a website added by hand has no commercials
 * row until something writes one.
 */
/**
 * The currency already on record for a listing.
 *
 * Read only when a write carries a cost and does not carry a currency, which
 * is the one case where it decides anything.
 */
async function recordedCostCurrency(supabase: Client, websiteId: string): Promise<string | null> {
  const { data } = await supabase
    .from('website_commercials')
    .select('cost_currency')
    .eq('website_id', websiteId)
    .maybeSingle();
  return usableCurrency((data as { cost_currency: string | null } | null)?.cost_currency);
}

async function syncCostCurrency(
  supabase: Client,
  websiteId: string,
  costCurrency: string | undefined,
  updatedBy?: string,
) {
  // An update that does not mention it must not clear it.
  if (costCurrency === undefined) return;

  const { error } = await supabase.from('website_commercials').upsert(
    {
      website_id: websiteId,
      // Blank clears it back to "not recorded", which is a real answer and
      // not the same as GBP. The same rule the write guard applies, from the
      // same place, so the two cannot drift into disagreeing about what
      // counts as a currency.
      cost_currency: usableCurrency(costCurrency),
      updated_by: updatedBy ?? null,
    },
    { onConflict: 'website_id' },
  );

  if (error) throw new Error(`Failed to save the publisher currency: ${error.message}`);
}

/**
 * The body behind `getStats`, kept out of the object so `cache` can wrap it.
 *
 * `cache` memoises per request, and it has to wrap one function for every
 * caller to share the answer - a method that called a cached helper would
 * work, but this says plainly that the memoised thing is the read itself.
 */
const readStats = cache(async () => {
  const supabase = await getServerClient();
  const { data } = await supabase.rpc('marketplace_stats').maybeSingle();
  const stats = (data ?? {}) as {
    total_websites?: number;
    total_niches?: number;
    total_countries?: number;
  };

  return {
    totalWebsites: stats.total_websites ?? 0,
    totalNiches: stats.total_niches ?? 0,
    totalCountries: stats.total_countries ?? 0,
    medianDomainRating: 0,
    lowestPriceMinor: 0,
  };
});

export const supabaseWebsiteRepository = {
  async getAll(): Promise<WebsiteListItem[]> {
    const supabase = await getServerClient();

    // Ordered by `id` as well as by rank. Domain ratings tie constantly - a
    // hundred listings share a DR of 40 - and paging by offset over an order
    // the database is free to break ties in differently on each request
    // skips some rows and returns others twice.
    const rows = await readAllPages<WebsiteRow>('the marketplace', (from, to) =>
      supabase
        .from('websites')
        .select(WEBSITE_SELECT)
        .eq('status', 'active')
        .order('domain_rating', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );

    warnIfOutgrown('the marketplace', rows.length);
    return rows.map((row) => toListItem(mapWebsite(row)));
  },

  /**
   * One page of the admin website table.
   *
   * The full read below is still here and still correct; it is just no longer
   * what a page load costs. 11,042 listings with costs, contacts and
   * commercials joined on is twenty-three sequential round trips before
   * anything is mapped, and the table shows fifty rows.
   *
   * Two reads, both small, the same split the marketplace uses: SQL decides
   * which listings and in what order, and the rows come back through the
   * admin select and mapper this file already has - so nothing about what a
   * listing *is* gets defined twice.
   */
  async adminPage(
    search: string,
    status: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: WebsiteListItem[]; total: number }> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('admin_website_page', {
      p_search: search.trim() || null,
      p_status: status || 'all',
      p_limit: pageSize,
      p_offset: Math.max(0, (page - 1) * pageSize),
    });

    if (error) throw new Error(`Could not read the website list: ${error.message}`);

    const rows = (data ?? []) as { id: string; total: number }[];
    const total = Number(rows[0]?.total ?? 0);
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total };

    const { data: full } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT_ADMIN)
      .in('id', ids);

    const byId = new Map(
      ((full as unknown as WebsiteRow[] | null) ?? []).map((row) => [
        row.id,
        toListItem(mapWebsite(row)),
      ]),
    );

    // The order is the function's. `in (...)` returns rows in whatever order
    // it likes, and re-sorting here would undo it.
    return {
      items: ids
        .map((id) => byId.get(id))
        .filter((item): item is WebsiteListItem => Boolean(item)),
      total,
    };
  },

  /** Listings by id with the admin select, for the export and the rate card. */
  async adminRows(ids: string[]): Promise<WebsiteListItem[]> {
    if (ids.length === 0) return [];
    const supabase = getAdminScopedClient();
    const { data } = await supabase.from('websites').select(WEBSITE_SELECT_ADMIN).in('id', ids);
    return ((data as unknown as WebsiteRow[] | null) ?? []).map((row) => toListItem(mapWebsite(row)));
  },

  /**
   * Every listing id a filter matches.
   *
   * For the header checkbox, which selects a whole filter rather than the
   * page on screen - filtering to "draft" and ticking it is how a couple of
   * hundred listings get status-changed in one go, and paging must not
   * quietly turn that into "these fifty".
   *
   * Ids only. Eleven thousand uuids is around four hundred kilobytes and is
   * fetched when somebody ticks the box, not on every page load.
   */
  async adminIds(search: string, status: string): Promise<string[]> {
    const supabase = getAdminScopedClient();

    /*
      Walked, not asked for once.

      The first version of this called the function once and the checkbox
      reported "1000 selected" against 12,246 listings. PostgREST caps what
      one response carries - a thousand rows on a Supabase project - and
      nothing in the answer says the cap was applied, which is the whole
      reason `readAllPages` exists and the reason it advances by what arrived
      rather than by what it asked for.
    */
    const rows = await readAllPages<{ id: string }>('the matching listings', (from, to) =>
      supabase.rpc('admin_website_ids', {
        p_search: search.trim() || null,
        p_status: status || 'all',
        p_limit: to - from + 1,
        p_offset: from,
      }),
    );

    return rows.map((row) => row.id);
  },

  /**
   * The domains behind a selection, and nothing else.
   *
   * "Copy domains" produces a list for somebody else's tool. Reading it
   * through the admin row select meant metrics, services, niche prices,
   * contacts and commercials for every listing, and pricing all of them, to
   * use one column - which at twelve thousand listings is a wait rather than
   * a button.
   */
  async adminDomains(ids: string[]): Promise<{ id: string; domain: string }[]> {
    if (ids.length === 0) return [];
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('admin_website_domains', { p_ids: ids });
    if (error) throw new Error(`Could not read the domains: ${error.message}`);
    return (data ?? []) as { id: string; domain: string }[];
  },

  async getAllForAdmin(): Promise<WebsiteListItem[]> {
    const supabase = getAdminScopedClient();

    // This is the read behind the count in the corner of the websites page,
    // which sat on "1000 websites" while the inventory grew past it.
    const rows = await readAllPages<WebsiteRow>('the website list', (from, to) =>
      supabase
        .from('websites')
        .select(WEBSITE_SELECT_ADMIN)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );

    warnIfOutgrown('the admin website list', rows.length);
    return rows.map((row) => toListItem(mapWebsite(row)));
  },

  /** Admin only - the public site looks listings up by slug, not id. */
  async getById(id: string): Promise<Website | null> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT_ADMIN)
      .eq('id', id)
      .maybeSingle();
    return data ? mapWebsite(data as unknown as WebsiteRow) : null;
  },

  async getBySlug(slug: string): Promise<Website | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('slug', slug)
      .maybeSingle();
    return data ? mapWebsite(data as unknown as WebsiteRow) : null;
  },

  async getSlugs(): Promise<string[]> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('websites').select('slug').eq('status', 'active');
    return (data ?? []).map((row) => row.slug as string);
  },

  /**
   * The related strip, asked for properly.
   *
   * Takes the listing rather than its slug, because the page has already read
   * it: the previous version looked it up again here, which was the third
   * identical read of the same row in one request.
   *
   * The database does the filtering and the ordering. It is asked for the few
   * listings immediately above this one's Domain Rating and the few
   * immediately below, which is all the nearest-neighbour answer can possibly
   * come from - so at most eight rows are fetched to show four, instead of
   * sixty to show four. It also cannot come back empty while matches exist,
   * which the old unordered `limit(60)` could and increasingly would as the
   * inventory grew.
   */
  async getRelated(current: Website, limit = 4): Promise<WebsiteListItem[]> {
    const supabase = await getServerClient();

    /*
      The niche, as a category id.

      `websites` stores `primary_category_id` and the listing carries the
      category's slug, so one of them has to be translated. Doing it with a
      tiny indexed lookup rather than a filter on an embedded resource keeps
      the main query a plain equality on an indexed column, which is the part
      that has to stay fast.
    */
    const { data: category } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', current.niche)
      .maybeSingle();

    const categoryId = (category as { id: string } | null)?.id;
    // No category means no niche to be related by. Four arbitrary listings
    // would be worse than an honest empty strip.
    if (!categoryId) return [];

    /*
      Finite, because it is interpolated into a filter string.

      `domainRating` comes through `toNumber`, so it is already a number - but
      this is the one value in the query that becomes text rather than being
      passed as a parameter, and `domain_rating.lt.NaN` is a request PostgREST
      answers with an error rather than an empty strip.
    */
    const target = Number.isFinite(current.metrics.domainRating)
      ? current.metrics.domainRating
      : 0;
    const perSide = candidatesPerSide(limit);

    const base = () =>
      supabase
        .from('websites')
        .select(WEBSITE_SELECT)
        .eq('status', 'active')
        .eq('primary_category_id', categoryId)
        .neq('slug', current.slug);

    const [above, below] = await Promise.all([
      base()
        .gte('domain_rating', target)
        .order('domain_rating', { ascending: true })
        // A stable second key, so two listings on the same DR do not swap
        // places between page loads.
        .order('slug', { ascending: true })
        .limit(perSide),
      /*
        Below, and the unmeasured ones with them.

        A listing whose DR has never been measured is still in the same niche,
        which is the stronger relevance signal of the two. `lt` alone would
        drop it silently - exactly the kind of quiet exclusion this rewrite
        exists to remove. It maps to a DR of 0, so the ranking puts it last on
        its own merits rather than by being hidden.
      */
      base()
        .or(`domain_rating.lt.${target},domain_rating.is.null`)
        .order('domain_rating', { ascending: false, nullsFirst: false })
        .order('slug', { ascending: true })
        .limit(perSide),
    ]);

    const rows = [
      ...((above.data as unknown as WebsiteRow[] | null) ?? []),
      ...((below.data as unknown as WebsiteRow[] | null) ?? []),
    ];

    return rankRelated(rows.map(mapWebsite), relatedTarget(current), limit).map(toListItem);
  },

  /**
   * One page of the marketplace, filtered in the database.
   *
   * The replacement this file has been describing since it was written. The
   * full read it supersedes shipped every active listing to the browser so the
   * browser could filter it - fine at a few hundred, and 3,405 live listings
   * with 7,174 approved and waiting is not a few hundred.
   *
   * Two reads, both small. `marketplace_search` decides which listings and in
   * what order and hands back ids; the rows themselves come through the select
   * and mapper this file already uses, so nothing about what a listing *is*
   * is defined twice. `verify:search` runs both engines over the same fixtures
   * and compares the id sequences, because the way this goes wrong is quietly.
   *
   * The order comes from the function, not from the second read: `in (...)`
   * returns rows in whatever order it likes, and a page that re-sorted them
   * would undo the sort the customer asked for.
   */
  async search(
    query: WebsiteQuery,
    topic?: string,
  ): Promise<PaginatedResult<WebsiteListItem>> {
    const supabase = await getServerClient();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);

    const { data, error } = await supabase.rpc('marketplace_search', {
      p_search: query.search?.trim() || null,
      p_niches: query.niches?.length ? query.niches : null,
      p_countries: query.countries?.length ? query.countries : null,
      p_audience_country: query.audienceCountry ?? null,
      p_audience_share_min: query.audienceShareMin ?? null,
      p_audience_traffic_min: query.audienceTrafficMin ?? null,
      p_languages: query.languages?.length ? query.languages : null,
      p_link_types: query.linkTypes?.length ? query.linkTypes : null,
      p_link_attribute: query.linkAttribute ?? null,
      p_dr_min: query.domainRating?.min ?? null,
      p_dr_max: query.domainRating?.max ?? null,
      p_traffic_min: query.organicTraffic?.min ?? null,
      p_traffic_max: query.organicTraffic?.max ?? null,
      p_rd_min: query.referringDomains?.min ?? null,
      p_rd_max: query.referringDomains?.max ?? null,
      p_price_min: query.price?.min ?? null,
      p_price_max: query.price?.max ?? null,
      p_max_turnaround: query.maxTurnaroundDays ?? null,
      p_verified: Boolean(query.verifiedOnly),
      p_topic: topic ?? null,
      p_sort: query.sort ?? 'relevance',
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
    });

    if (error) throw new Error(`Could not search the marketplace: ${error.message}`);

    const rows = (data ?? []) as { id: string; total: number }[];
    const total = Number(rows[0]?.total ?? 0);
    const ids = rows.map((row) => row.id);

    const found = await supabaseWebsiteRepository.getByIds(ids);
    const byId = new Map(found.map((item) => [item.id, item]));

    return {
      items: ids
        .map((id) => byId.get(id))
        .filter((item): item is WebsiteListItem => Boolean(item)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },

  /**
   * What the sidebar may offer, and how much of it.
   *
   * Counted in the database because the page can no longer count what it is
   * not holding. One call for all three, keyed by kind.
   */
  async facets(topic?: string): Promise<MarketplaceFacets> {
    const supabase = await getServerClient();
    const { data, error } = await supabase.rpc('marketplace_facets', {
      p_topic: topic ?? null,
    });

    if (error) throw new Error(`Could not count the marketplace filters: ${error.message}`);

    const rows = (data ?? []) as { kind: string; value: string; count: number }[];
    const niches: Record<string, number> = {};
    const countries: [string, number][] = [];
    const languages: string[] = [];
    let unstated = 0;

    for (const row of rows) {
      if (row.kind === 'niche') niches[row.value] = Number(row.count);
      else if (row.kind === 'language') languages.push(row.value);
      else if (row.kind === 'country') countries.push([row.value, Number(row.count)]);
      else if (row.kind === 'country-unstated') unstated = Number(row.count);
    }

    // Biggest first, as the sidebar has always shown them.
    countries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    languages.sort();

    return { niches, countries, unstated, languages };
  },

  async getByIds(ids: string[]): Promise<WebsiteListItem[]> {
    if (ids.length === 0) return [];
    const supabase = await getServerClient();
    const { data } = await supabase.from('websites').select(WEBSITE_SELECT).in('id', ids);
    return ((data as unknown as WebsiteRow[] | null) ?? []).map((row) => toListItem(mapWebsite(row)));
  },

  async getFeatured(limit = 6): Promise<WebsiteListItem[]> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('status', 'active')
      .eq('verified', true)
      .order('domain_rating', { ascending: false })
      .limit(limit);
    return ((data as unknown as WebsiteRow[] | null) ?? []).map((row) => toListItem(mapWebsite(row)));
  },

  /**
   * How many active listings sit in each niche.
   *
   * One `group by` in the database. This used to page through every active
   * listing and count the rows here - correctly paged, which was the
   * problem: 3,405 listings at 500 a page is seven requests one after
   * another, and the homepage's four parallel reads all waited for it.
   *
   * The shape is unchanged: a record keyed by niche slug, with niches that
   * have no listings simply absent, exactly as counting produced.
   */
  async countByNiche(): Promise<Record<NicheSlug, number>> {
    const supabase = await getServerClient();

    const { data, error } = await supabase.rpc('marketplace_niche_counts');
    if (error) throw new Error(`Failed to load the niche counts: ${error.message}`);

    const counts = {} as Record<NicheSlug, number>;
    for (const row of (data ?? []) as { niche: string; listings: number }[]) {
      // A slug the application does not know about is skipped rather than
      // added: these index a fixed set of niche cards, and an unknown key
      // would render as a card with no name.
      if (row.niche) counts[row.niche as NicheSlug] = Number(row.listings);
    }
    return counts;
  },

  /**
   * Aggregates for signed-out pages.
   *
   * Uses the `marketplace_stats()` function, which is security-definer and
   * returns three numbers. A signed-out caller cannot read the websites table
   * directly, and this cannot leak a domain because it does not select one.
   *
   * Read once per request however many times it is asked for. The homepage
   * asks twice without meaning to - once for the hero and the trust row, and
   * again inside `getPublicPreview`, which uses the same three figures for
   * its totals. Measured against the live database that second ask cost
   * another 131ms, which is what one round trip costs from where this is
   * deployed. Nothing writes these during a render, so there is no write for
   * a stale answer to follow.
   */
  getStats: readStats,

  /**
   * The redacted preview shown to signed-out visitors.
   *
   * Reads through the admin client on purpose: RLS correctly denies a
   * signed-out request, but this page legitimately needs *shapes* of rows.
   * Everything identifying is dropped by `toPreviewRows` before it leaves this
   * function, so what escapes is a masked label and banded metrics - never a
   * domain, slug or id.
   */
  /**
   * Every active listing in one niche.
   *
   * For the public niche pages, which need the whole set rather than a sample:
   * the DR range, the country count and the starting price are all claims
   * about the niche, and a claim drawn from the first page of it would be
   * wrong in the direction that flatters us.
   *
   * Paged for the reason every full read here is paged - a bare limit comes
   * back truncated at a thousand rows with no error - and filtered in
   * JavaScript because a listing's niche is in a join table and its secondary
   * niches in another, which is what `countByNiche` does too.
   */
  async listForNiche(niche: NicheSlug): Promise<WebsiteListItem[]> {
    const admin = getAdminClient();
    const supabase = admin ?? (await getServerClient());

    const data = await readAllPages<WebsiteRow>('the listings in a niche', (from, to) =>
      supabase
        .from('websites')
        .select(WEBSITE_SELECT)
        .eq('status', 'active')
        .order('domain_rating', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );

    return data
      .map((row) => toListItem(mapWebsite(row)))
      .filter((website) => matchesNiche(website, niche));
  },

  async getPublicPreview(limit = 6, niche?: NicheSlug): Promise<MarketplacePreview> {
    const admin = getAdminClient();
    const supabase = admin ?? (await getServerClient());

    /*
      A niche page asks the database for its sample and its counts.

      This used to page through every active listing - with services, niche
      prices, categories and topics joined on - and filter by niche in
      JavaScript, to show six rows. Twenty-six sequential round trips at the
      current inventory, on pages that are public and indexed.

      The sample is still a spread rather than the strongest six, because the
      point of it is to represent the marketplace rather than advertise its
      top end. `marketplace_niche_preview` walks the same order in the same
      strides; what changed is that it returns six ids instead of everything.
    */
    if (niche) {
      const { data: sampled, error } = await supabase.rpc('marketplace_niche_preview', {
        p_niche: niche,
        p_limit: limit,
      });
      if (error) throw new Error(`Failed to load the marketplace preview: ${error.message}`);

      const picked = (sampled ?? []) as { id: string; total: number; countries: number }[];
      const listings = picked.length
        ? await supabaseWebsiteRepository.getByIds(picked.map((row) => row.id))
        : [];

      // The ids come back in sample order; `getByIds` does not promise one.
      const byId = new Map(listings.map((website) => [website.id, website]));
      const sample = picked
        .map((row) => byId.get(row.id))
        .filter((website): website is WebsiteListItem => Boolean(website));

      return {
        rows: toPreviewRows(sample, limit),
        totalWebsites: Number(picked[0]?.total ?? 0),
        totalNiches: 1,
        totalCountries: Number(picked[0]?.countries ?? 0),
      };
    }

    /*
      No niche: one page, on purpose.

      120 listings by rank is plenty to draw six rows from, and nothing on
      this path is counted from them - the three figures below come from
      `getStats`, which counts in the database. A capped read is only a bug
      when something is counted from it.
    */
    const { data: page, error } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('status', 'active')
      .order('domain_rating', { ascending: false })
      .limit(120);
    // This read used to discard its error and count the empty array, which
    // showed a live marketplace as holding no listings at all.
    if (error) throw new Error(`Failed to load the marketplace preview: ${error.message}`);

    const websites = ((page ?? []) as unknown as WebsiteRow[]).map((row) =>
      toListItem(mapWebsite(row)),
    );

    // Spread across the inventory rather than taking the strongest few, so the
    // preview represents the marketplace instead of advertising its top end.
    const stride = Math.max(1, Math.floor(websites.length / Math.max(limit, 1)));
    const sample: WebsiteListItem[] = [];
    for (let index = 0; index < websites.length && sample.length < limit; index += stride) {
      sample.push(websites[index] as WebsiteListItem);
    }

    const rows = toPreviewRows(sample, limit);

    const stats = await supabaseWebsiteRepository.getStats();
    return {
      rows,
      totalWebsites: stats.totalWebsites,
      totalNiches: stats.totalNiches,
      totalCountries: stats.totalCountries,
    };
  },

  async create(input: Partial<Website> & { domain: string }): Promise<Website> {
    const supabase = getAdminScopedClient();
    const row = {
      ...websiteToRow({ ...newWebsiteDefaults(input.domain), ...input }),
      slug: input.slug ?? slugifyDomain(input.domain),
      domain: input.domain,
      title: input.title ?? input.domain,
      status: input.status ?? 'draft',
    };

    /*
      Checked before the insert, not after.

      A new listing has no commercials row to fall back on, so the currency
      has to be in this write. Refusing after the insert would leave a website
      row with no services behind it, which is worse than the thing being
      refused.
    */
    if (
      costCurrencyBlocker({
        services: input.services,
        supplied: input.costCurrency,
        recorded: null,
      })
    ) {
      throw new Error(COST_CURRENCY_MESSAGE);
    }

    const { data, error } = await supabase
      .from('websites')
      .insert(row)
      .select(WEBSITE_SELECT)
      .single();

    if (error) throw new Error(`Failed to create website: ${error.message}`);

    const created = mapWebsite(data as unknown as WebsiteRow);
    await syncCategories(supabase, created.id, input.niche, input.secondaryNiches);
    await syncServices(supabase, created.id, input.services);
    await syncNichePrices(supabase, created.id, input.nichePrices);
    await syncContact(supabase, created.id, input.contact);
    await syncCostCurrency(supabase, created.id, input.costCurrency);

    return (await supabaseWebsiteRepository.getById(created.id)) ?? created;
  },

  async update(id: string, patch: Partial<Website>): Promise<Website | null> {
    const supabase = getAdminScopedClient();
    const columns = websiteToRow(patch);

    /*
      A cost needs a currency, from this write or from the listing.

      Checked first, so a patch that would have saved an unusable cost changes
      nothing at all rather than writing the parts that passed. The read only
      happens when a cost is being written without a currency beside it.
    */
    if (writesACost(patch.services)) {
      // Read only when the patch is silent, which is the only case it decides.
      const recorded =
        patch.costCurrency === undefined ? await recordedCostCurrency(supabase, id) : null;
      if (
        costCurrencyBlocker({
          services: patch.services,
          supplied: patch.costCurrency,
          recorded,
        })
      ) {
        throw new Error(COST_CURRENCY_MESSAGE);
      }
    }

    // A patch that only changes services or niches has nothing to write here,
    // and Supabase rejects an empty update.
    if (Object.keys(columns).length > 0) {
      const { error } = await supabase.from('websites').update(columns).eq('id', id);
      if (error) throw new Error(`Failed to update website: ${error.message}`);
    }

    await syncCategories(supabase, id, patch.niche, patch.secondaryNiches);
    await syncServices(supabase, id, patch.services);
    await syncNichePrices(supabase, id, patch.nichePrices);
    await syncContact(supabase, id, patch.contact);
    await syncCostCurrency(supabase, id, patch.costCurrency);

    // Re-read rather than trusting the update's return value: the services and
    // categories were written after it, so it would be a stale picture.
    return supabaseWebsiteRepository.getById(id);
  },

  async setStatus(id: string, status: WebsiteStatus) {
    return supabaseWebsiteRepository.update(id, { status });
  },

  async getDomainIndex(): Promise<Record<string, string>> {
    const supabase = getAdminScopedClient();
    // Only two columns - the importer compares millions of rows in the worst
    // case and does not need the rest.
    // Paged, not `.limit(50_000)`: PostgREST answered that with the first
    // thousand and no error, so an import past the thousandth domain found no
    // match and created a duplicate listing instead of updating the one that
    // was already there. Of the five truncated reads this is the only one
    // that wrote bad data rather than displaying it.
    const data = await readAllPages<{ id: string; domain: string }>(
      'the domain index',
      (from, to) =>
        supabase
          .from('websites')
          .select('id, domain')
          .order('id', { ascending: true })
          .range(from, to),
    );

    const index: Record<string, string> = {};
    for (const row of data) {
      const domain = normaliseDomain(row.domain);
      if (domain) index[domain] = row.id;
    }
    return index;
  },

  /**
   * Bulk create or update from the CSV importer.
   *
   * Rows are processed independently so one bad row never fails the batch,
   * matching the mock implementation's contract exactly.
   */
  async bulkUpsert(rows: ImportPayloadRow[], mode: DuplicateMode): Promise<ImportBatchResult> {
    const result: ImportBatchResult = { created: 0, updated: 0, skipped: 0, failed: [] };
    const index = await supabaseWebsiteRepository.getDomainIndex();

    for (const row of rows) {
      try {
        const domain = normaliseDomain(row.domain);
        if (!domain) {
          result.failed.push({
            rowNumber: row.rowNumber,
            domain: row.domain,
            reason: 'Invalid domain',
          });
          continue;
        }

        const existingId = index[domain];

        if (existingId) {
          if (mode !== 'update') {
            result.skipped += 1;
            continue;
          }
          const existing = await supabaseWebsiteRepository.getById(existingId);
          if (!existing) {
            result.failed.push({ rowNumber: row.rowNumber, domain, reason: 'Website disappeared' });
            continue;
          }
          // Only supplied columns are written, so a blank CSV cell never
          // blanks a populated value.
          await supabaseWebsiteRepository.update(
            existingId,
            toWebsitePatch(row.values, row.supplied, existing),
          );
          result.updated += 1;
          continue;
        }

        const created = await supabaseWebsiteRepository.create({ domain });
        await supabaseWebsiteRepository.update(
          created.id,
          toWebsitePatch(row.values, row.supplied, created),
        );
        index[domain] = created.id;
        result.created += 1;
      } catch (error) {
        result.failed.push({
          rowNumber: row.rowNumber,
          domain: row.domain,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return result;
  },

  /**
   * Remove a listing entirely.
   *
   * Services, category links and saved-site entries cascade away with it.
   * Order items deliberately do not: `order_items.website_id` is `on delete
   * restrict`, so a website somebody has ordered cannot be deleted at all.
   * That is the database refusing to erase the record of a sale, which is the
   * right instinct - the caller turns the refusal into an explanation rather
   * than treating it as a failure.
   */
  async delete(id: string): Promise<{ ok: boolean; reason?: string }> {
    const supabase = getAdminScopedClient();
    const { error } = await supabase.from('websites').delete().eq('id', id);

    if (!error) return { ok: true };

    // 23503 is foreign_key_violation: something still points at this row, and
    // the only thing that can is an order item.
    if (error.code === '23503') {
      return { ok: false, reason: 'Has orders against it. Archive it instead.' };
    }
    return { ok: false, reason: error.message };
  },

  async duplicate(id: string): Promise<Website | null> {
    const existing = await supabaseWebsiteRepository.getById(id);
    if (!existing) return null;

    const domain = `copy-of-${existing.domain}`;
    const created = await supabaseWebsiteRepository.create({
      ...existing,
      domain,
      slug: slugifyDomain(domain),
      status: 'draft',
    });
    return created;
  },
};
