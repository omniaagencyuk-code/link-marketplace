import { websites as seedWebsites } from '@/lib/data/websites';
import { runQuery, toListItem } from './query-engine';
import { slugifyDomain } from '@/lib/utils/format';
import { normaliseDomain } from '@/lib/import/normalise';
import { newWebsiteDefaults, toWebsitePatch } from '@/lib/import/to-website';
import type { ImportPayloadRow, ImportBatchResult, DuplicateMode } from '@/lib/import/types';
import type {
  NicheSlug,
  PaginatedResult,
  Website,
  WebsiteListItem,
  WebsiteQuery,
  WebsiteStatus,
} from '@/lib/types';

/**
 * Website repository.
 *
 * The mock implementation keeps an in-memory copy of the seed data so admin
 * create/update calls behave realistically during a session. Swap the body of
 * each method for a Supabase query and the UI keeps working unchanged.
 */

let store: Website[] = seedWebsites.map((website) => ({ ...website }));

/**
 * Monotonic suffix for generated ids.
 *
 * A bulk import creates hundreds of records inside the same millisecond, so a
 * timestamp alone is not unique.
 */
let idSequence = 0;

function listItems(includeInactive = false) {
  return store
    .filter((website) => includeInactive || website.status === 'active')
    .map(toListItem);
}

export interface MarketplaceStats {
  totalWebsites: number;
  totalNiches: number;
  totalCountries: number;
  medianDomainRating: number;
  lowestPriceMinor: number;
}

export const websiteService = {
  /** Every active listing, as list items. */
  async getAll(): Promise<WebsiteListItem[]> {
    return listItems();
  },

  /** Every listing including drafts, paused and archived. Admin only. */
  async getAllForAdmin(): Promise<WebsiteListItem[]> {
    return listItems(true);
  },

  async getById(id: string): Promise<Website | null> {
    return store.find((website) => website.id === id) ?? null;
  },

  async getBySlug(slug: string): Promise<Website | null> {
    return store.find((website) => website.slug === slug) ?? null;
  },

  async getSlugs(): Promise<string[]> {
    return store.filter((website) => website.status === 'active').map((website) => website.slug);
  },

  /** Filter, sort and paginate. Used by the marketplace page. */
  async search(query: WebsiteQuery): Promise<PaginatedResult<WebsiteListItem>> {
    return runQuery(listItems(), query);
  },

  /** Highest quality active listings, used on the homepage. */
  async getFeatured(limit = 6): Promise<WebsiteListItem[]> {
    return listItems()
      .filter((website) => website.verified)
      .sort(
        (a, b) =>
          b.metrics.domainRating * 1000 +
          b.completedOrders -
          (a.metrics.domainRating * 1000 + a.completedOrders),
      )
      .slice(0, limit);
  },

  /** Sites in the same niche, excluding the current one. */
  async getRelated(slug: string, limit = 4): Promise<WebsiteListItem[]> {
    const current = store.find((website) => website.slug === slug);
    if (!current) return [];
    return listItems()
      .filter((website) => website.slug !== slug && website.niche === current.niche)
      .sort(
        (a, b) =>
          Math.abs(a.metrics.domainRating - current.metrics.domainRating) -
          Math.abs(b.metrics.domainRating - current.metrics.domainRating),
      )
      .slice(0, limit);
  },

  async getByIds(ids: string[]): Promise<WebsiteListItem[]> {
    const wanted = new Set(ids);
    return listItems(true).filter((website) => wanted.has(website.id));
  },

  async countByNiche(): Promise<Record<NicheSlug, number>> {
    const counts = {} as Record<NicheSlug, number>;
    for (const website of store) {
      if (website.status !== 'active') continue;
      counts[website.niche] = (counts[website.niche] ?? 0) + 1;
    }
    return counts;
  },

  async getStats(): Promise<MarketplaceStats> {
    const active = listItems();
    const ratings = active.map((website) => website.metrics.domainRating).sort((a, b) => a - b);
    const middle = Math.floor(ratings.length / 2);
    return {
      totalWebsites: active.length,
      totalNiches: new Set(active.map((website) => website.niche)).size,
      totalCountries: new Set(active.map((website) => website.country)).size,
      medianDomainRating: ratings.length ? (ratings[middle] as number) : 0,
      lowestPriceMinor: active.length
        ? Math.min(...active.map((website) => website.lowestPriceMinor))
        : 0,
    };
  },

  async create(input: Partial<Website> & { domain: string }): Promise<Website> {
    const now = new Date().toISOString();
    const base = store[0] as Website;
    const website: Website = {
      ...base,
      ...input,
      id: `web_${Date.now().toString(36)}${(idSequence++).toString(36)}`,
      slug: input.slug ?? slugifyDomain(input.domain),
      services: input.services ?? [],
      createdAt: now,
      updatedAt: now,
      status: input.status ?? 'draft',
    };
    store = [website, ...store];
    return website;
  },

  async update(id: string, patch: Partial<Website>): Promise<Website | null> {
    const index = store.findIndex((website) => website.id === id);
    if (index === -1) return null;
    const updated: Website = {
      ...(store[index] as Website),
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    store[index] = updated;
    return updated;
  },

  async setStatus(id: string, status: WebsiteStatus) {
    return websiteService.update(id, { status });
  },

  /**
   * Normalised domain -> website id, for duplicate detection during import.
   * A Supabase implementation would select id and domain rather than loading
   * every record.
   */
  async getDomainIndex(): Promise<Record<string, string>> {
    const index: Record<string, string> = {};
    for (const website of store) {
      const domain = normaliseDomain(website.domain);
      if (domain) index[domain] = website.id;
    }
    return index;
  },

  /**
   * Create or update many websites in one call.
   *
   * The single place bulk writes happen, so swapping in Supabase means
   * replacing this body with a batched upsert rather than touching the UI.
   * Rows are processed independently: one bad row never fails the batch.
   */
  async bulkUpsert(rows: ImportPayloadRow[], mode: DuplicateMode): Promise<ImportBatchResult> {
    const result: ImportBatchResult = { created: 0, updated: 0, skipped: 0, failed: [] };

    for (const row of rows) {
      try {
        const domain = normaliseDomain(row.domain);
        if (!domain) {
          result.failed.push({ rowNumber: row.rowNumber, domain: row.domain, reason: 'Invalid domain' });
          continue;
        }

        // Re-check against the live store rather than trusting the client,
        // which may have prepared its preview minutes ago.
        const existing =
          store.find((website) => normaliseDomain(website.domain) === domain) ?? null;

        if (existing) {
          if (mode === 'skip') {
            result.skipped += 1;
            continue;
          }
          const patch = toWebsitePatch(row.values, row.supplied, existing);
          await websiteService.update(existing.id, patch);
          result.updated += 1;
          continue;
        }

        const created = await websiteService.create({
          ...newWebsiteDefaults(domain),
          domain,
        } as Partial<Website> & { domain: string });
        const patch = toWebsitePatch(row.values, row.supplied, created);
        // Services are created with a placeholder website id; bind them now.
        const services = (patch.services ?? []).map((service) => ({
          ...service,
          websiteId: created.id,
          id: service.id.replace('pending', created.id),
        }));
        await websiteService.update(created.id, { ...patch, services });
        result.created += 1;
      } catch (error) {
        result.failed.push({
          rowNumber: row.rowNumber,
          domain: row.domain,
          reason: error instanceof Error ? error.message : 'Unexpected error',
        });
      }
    }

    return result;
  },

  async duplicate(id: string): Promise<Website | null> {
    const original = store.find((website) => website.id === id);
    if (!original) return null;
    return websiteService.create({
      ...original,
      domain: `copy-${original.domain}`,
      slug: `${original.slug}-copy`,
      status: 'draft',
    });
  },
};
