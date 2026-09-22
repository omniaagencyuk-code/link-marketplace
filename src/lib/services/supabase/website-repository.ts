import { getServerClient, getAdminClient, getAdminScopedClient } from '@/lib/supabase/server';
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
import type { ImportBatchResult, ImportPayloadRow, DuplicateMode } from '@/lib/import/types';
import type {
  NichePrice,
  NicheSlug,
  Service,
  Website,
  WebsiteListItem,
  WebsiteStatus,
} from '@/lib/types';

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
 * Upper bound on a full marketplace read.
 *
 * The marketplace filters client-side over the whole dataset, which is fast
 * and keeps the UI instant, but it does mean the page ships every active
 * listing. That is fine into the low thousands and wrong beyond it. When the
 * inventory outgrows this, `search()` below is the replacement: it already
 * pushes filtering into the database.
 */
const MAX_LIST_ROWS = 2000;


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
  niche: string | undefined,
  secondary: string[] | undefined,
) {
  // An update that touches neither must not clear what is already there.
  if (niche === undefined && secondary === undefined) return;

  const ids = await categoryIds(supabase, [...(niche ? [niche] : []), ...(secondary ?? [])]);

  if (niche !== undefined) {
    const primaryId = ids.get(niche) ?? null;
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

export const supabaseWebsiteRepository = {
  async getAll(): Promise<WebsiteListItem[]> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('status', 'active')
      .order('domain_rating', { ascending: false })
      .limit(MAX_LIST_ROWS);

    if (error) throw new Error(`Failed to load websites: ${error.message}`);
    return (data as unknown as WebsiteRow[]).map((row) => toListItem(mapWebsite(row)));
  },

  async getAllForAdmin(): Promise<WebsiteListItem[]> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT_ADMIN)
      .order('updated_at', { ascending: false })
      .limit(MAX_LIST_ROWS);

    if (error) throw new Error(`Failed to load websites: ${error.message}`);
    return (data as unknown as WebsiteRow[]).map((row) => toListItem(mapWebsite(row)));
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

  async getRelated(slug: string, limit = 4): Promise<WebsiteListItem[]> {
    const current = await supabaseWebsiteRepository.getBySlug(slug);
    if (!current) return [];

    const supabase = await getServerClient();
    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('status', 'active')
      .neq('slug', slug)
      .limit(60);

    const rows = (data as unknown as WebsiteRow[] | null) ?? [];
    return rows
      .map(mapWebsite)
      .filter((website) => website.niche === current.niche)
      .sort(
        (a, b) =>
          Math.abs(a.metrics.domainRating - current.metrics.domainRating) -
          Math.abs(b.metrics.domainRating - current.metrics.domainRating),
      )
      .slice(0, limit)
      .map(toListItem);
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

  async countByNiche(): Promise<Record<NicheSlug, number>> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('websites')
      .select('primary_category:categories!websites_primary_category_id_fkey (slug)')
      .eq('status', 'active')
      .limit(MAX_LIST_ROWS);

    // PostgREST returns an embedded one-to-one as an object, but the generated
    // types describe it as an array. Accept either rather than trusting one.
    type CategoryJoin = { slug: string } | { slug: string }[] | null;
    const counts = {} as Record<NicheSlug, number>;

    for (const row of (data ?? []) as unknown as { primary_category: CategoryJoin }[]) {
      const joined = row.primary_category;
      const slug = (Array.isArray(joined) ? joined[0]?.slug : joined?.slug) as
        | NicheSlug
        | undefined;
      if (!slug) continue;
      counts[slug] = (counts[slug] ?? 0) + 1;
    }
    return counts;
  },

  /**
   * Aggregates for signed-out pages.
   *
   * Uses the `marketplace_stats()` function, which is security-definer and
   * returns three numbers. A signed-out caller cannot read the websites table
   * directly, and this cannot leak a domain because it does not select one.
   */
  async getStats() {
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
  },

  /**
   * The redacted preview shown to signed-out visitors.
   *
   * Reads through the admin client on purpose: RLS correctly denies a
   * signed-out request, but this page legitimately needs *shapes* of rows.
   * Everything identifying is dropped by `toPreviewRows` before it leaves this
   * function, so what escapes is a masked label and banded metrics - never a
   * domain, slug or id.
   */
  async getPublicPreview(limit = 6): Promise<MarketplacePreview> {
    const admin = getAdminClient();
    const supabase = admin ?? (await getServerClient());

    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .eq('status', 'active')
      .order('domain_rating', { ascending: false })
      .limit(120);

    const websites = ((data as unknown as WebsiteRow[] | null) ?? []).map((row) =>
      toListItem(mapWebsite(row)),
    );

    // Spread across the inventory rather than taking the strongest few, so the
    // preview represents the marketplace instead of advertising its top end.
    const stride = Math.max(1, Math.floor(websites.length / Math.max(limit, 1)));
    const sample: WebsiteListItem[] = [];
    for (let index = 0; index < websites.length && sample.length < limit; index += stride) {
      sample.push(websites[index] as WebsiteListItem);
    }

    const stats = await supabaseWebsiteRepository.getStats();
    return {
      rows: toPreviewRows(sample, limit),
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

    return (await supabaseWebsiteRepository.getById(created.id)) ?? created;
  },

  async update(id: string, patch: Partial<Website>): Promise<Website | null> {
    const supabase = getAdminScopedClient();
    const columns = websiteToRow(patch);

    // A patch that only changes services or niches has nothing to write here,
    // and Supabase rejects an empty update.
    if (Object.keys(columns).length > 0) {
      const { error } = await supabase.from('websites').update(columns).eq('id', id);
      if (error) throw new Error(`Failed to update website: ${error.message}`);
    }

    await syncCategories(supabase, id, patch.niche, patch.secondaryNiches);
    await syncServices(supabase, id, patch.services);
    await syncNichePrices(supabase, id, patch.nichePrices);

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
    const { data } = await supabase.from('websites').select('id, domain').limit(50_000);

    const index: Record<string, string> = {};
    for (const row of (data ?? []) as { id: string; domain: string }[]) {
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
