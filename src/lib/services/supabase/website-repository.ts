import { getServerClient, getAdminClient } from '@/lib/supabase/server';
import { WEBSITE_SELECT, mapWebsite, websiteToRow, type WebsiteRow } from '@/lib/supabase/mappers';
import { toListItem } from '../query-engine';
import { toPreviewRows, type MarketplacePreview } from '../marketplace-preview';
import { normaliseDomain } from '@/lib/import/normalise';
import { newWebsiteDefaults, toWebsitePatch } from '@/lib/import/to-website';
import { slugifyDomain } from '@/lib/utils/format';
import type { ImportBatchResult, ImportPayloadRow, DuplicateMode } from '@/lib/import/types';
import type { NicheSlug, Website, WebsiteListItem, WebsiteStatus } from '@/lib/types';

/**
 * Websites, backed by Supabase.
 *
 * Reads go through the *user's* client, so row level security decides what
 * comes back: a signed-out request sees nothing, which is the gating working
 * rather than a bug to route around. The only exceptions are the two functions
 * that legitimately serve signed-out pages - `getPublicPreview` and
 * `getStats` - and both return aggregates or redacted rows, never a domain.
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
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
      .order('updated_at', { ascending: false })
      .limit(MAX_LIST_ROWS);

    if (error) throw new Error(`Failed to load websites: ${error.message}`);
    return (data as unknown as WebsiteRow[]).map((row) => toListItem(mapWebsite(row)));
  },

  async getById(id: string): Promise<Website | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('websites')
      .select(WEBSITE_SELECT)
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
    const supabase = await getServerClient();
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
    return mapWebsite(data as unknown as WebsiteRow);
  },

  async update(id: string, patch: Partial<Website>): Promise<Website | null> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('websites')
      .update(websiteToRow(patch))
      .eq('id', id)
      .select(WEBSITE_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Failed to update website: ${error.message}`);
    return data ? mapWebsite(data as unknown as WebsiteRow) : null;
  },

  async setStatus(id: string, status: WebsiteStatus) {
    return supabaseWebsiteRepository.update(id, { status });
  },

  async getDomainIndex(): Promise<Record<string, string>> {
    const supabase = await getServerClient();
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
