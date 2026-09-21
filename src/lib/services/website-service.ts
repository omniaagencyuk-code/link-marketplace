import { websites as seedWebsites } from '@/lib/data/websites';
import { runQuery, toListItem } from './query-engine';
import { slugifyDomain } from '@/lib/utils/format';
import { normaliseDomain } from '@/lib/import/normalise';
import { newWebsiteDefaults, toWebsitePatch } from '@/lib/import/to-website';
import { toPreviewRows, type MarketplacePreview } from './marketplace-preview';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseWebsiteRepository } from './supabase/website-repository';
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
 * Delegates to Supabase when it is connected. The mock implementation below
 * keeps an in-memory copy of the seed data, so the app runs from a clone with
 * no configuration and admin create/update calls still behave realistically.
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

/**
 * Remove our buy price before a record can reach a customer.
 *
 * The Supabase reads already leave it behind - customer queries do not join
 * `service_costs`, and the table has no policy that would let them - but a
 * `WebsiteListItem` is serialised straight into the marketplace page, and the
 * mock data source has no row level security at all. Stripping it on the way
 * out of every public method means the guarantee does not depend on remembering
 * which select was used.
 */
function withoutCost<T extends { services: Website['services'] }>(record: T): T {
  return {
    ...record,
    services: record.services.map(({ costPriceMinor: _cost, ...service }) => service),
  };
}

function publicItems<T extends { services: Website['services'] }>(records: T[]): T[] {
  return records.map(withoutCost);
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
    if (isSupabaseEnabled()) return publicItems(await supabaseWebsiteRepository.getAll());

    return publicItems(listItems());
  },

  /** Every listing including drafts, paused and archived. Admin only. */
  async getAllForAdmin(): Promise<WebsiteListItem[]> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getAllForAdmin();

    return listItems(true);
  },

  async getById(id: string): Promise<Website | null> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getById(id);

    return store.find((website) => website.id === id) ?? null;
  },

  async getBySlug(slug: string): Promise<Website | null> {
    const website = isSupabaseEnabled()
      ? await supabaseWebsiteRepository.getBySlug(slug)
      : (store.find((entry) => entry.slug === slug) ?? null);

    // This one renders the customer-facing listing page.
    return website ? withoutCost(website) : null;
  },

  async getSlugs(): Promise<string[]> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getSlugs();

    return store.filter((website) => website.status === 'active').map((website) => website.slug);
  },

  /** Filter, sort and paginate. Used by the marketplace page. */
  async search(query: WebsiteQuery): Promise<PaginatedResult<WebsiteListItem>> {
    const result = runQuery(listItems(), query);
    return { ...result, items: publicItems(result.items) };
  },

  /**
   * Highest quality active listings.
   *
   * Returns full listing data including domains, so it is only for signed-in
   * surfaces. Public pages use `getPublicPreview()`.
   */
  async getFeatured(limit = 6): Promise<WebsiteListItem[]> {
    if (isSupabaseEnabled()) return publicItems(await supabaseWebsiteRepository.getFeatured(limit));

    return publicItems(listItems()
      .filter((website) => website.verified)
      .sort(
        (a, b) =>
          b.metrics.domainRating * 1000 +
          b.completedOrders -
          (a.metrics.domainRating * 1000 + a.completedOrders),
      )
      .slice(0, limit));
  },

  /** Sites in the same niche, excluding the current one. */
  async getRelated(slug: string, limit = 4): Promise<WebsiteListItem[]> {
    if (isSupabaseEnabled()) return publicItems(await supabaseWebsiteRepository.getRelated(slug, limit));

    const current = store.find((website) => website.slug === slug);
    if (!current) return [];
    return publicItems(listItems())
      .filter((website) => website.slug !== slug && website.niche === current.niche)
      .sort(
        (a, b) =>
          Math.abs(a.metrics.domainRating - current.metrics.domainRating) -
          Math.abs(b.metrics.domainRating - current.metrics.domainRating),
      )
      .slice(0, limit);
  },

  async getByIds(ids: string[]): Promise<WebsiteListItem[]> {
    if (isSupabaseEnabled()) return publicItems(await supabaseWebsiteRepository.getByIds(ids));

    const wanted = new Set(ids);
    return publicItems(listItems(true).filter((website) => wanted.has(website.id)));
  },

  /**
   * Delete a listing.
   *
   * Refuses rather than throws when the listing has been ordered, so a bulk
   * delete can report "four gone, one kept because it has orders" instead of
   * failing the whole batch on one row.
   */
  async delete(id: string): Promise<{ ok: boolean; reason?: string }> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.delete(id);

    const index = store.findIndex((website) => website.id === id);
    if (index === -1) return { ok: false, reason: 'No longer exists.' };
    store.splice(index, 1);
    return { ok: true };
  },

  async countByNiche(): Promise<Record<NicheSlug, number>> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.countByNiche();

    const counts = {} as Record<NicheSlug, number>;
    for (const website of store) {
      if (website.status !== 'active') continue;
      counts[website.niche] = (counts[website.niche] ?? 0) + 1;
    }
    return counts;
  },

  async getStats(): Promise<MarketplaceStats> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getStats();

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

  /**
   * A redacted view of the marketplace for signed-out visitors.
   *
   * Returns banded metrics and masked domains only. Nothing identifying
   * survives `toPreviewRows`, so the result is safe to render into a public
   * page, its JSON payload and its structured data.
   *
   * The rows are spread across the inventory rather than taken from the top,
   * so the preview represents the marketplace instead of advertising its five
   * strongest sites.
   */
  async getPublicPreview(limit = 6): Promise<MarketplacePreview> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getPublicPreview(limit);

    const active = listItems();
    const stride = Math.max(1, Math.floor(active.length / Math.max(limit, 1)));
    const sample: WebsiteListItem[] = [];
    for (let index = 0; index < active.length && sample.length < limit; index += stride) {
      sample.push(active[index] as WebsiteListItem);
    }

    return {
      rows: toPreviewRows(
        sample.sort((a, b) => b.metrics.domainRating - a.metrics.domainRating),
        limit,
      ),
      totalWebsites: active.length,
      totalNiches: new Set(active.map((website) => website.niche)).size,
      totalCountries: new Set(active.map((website) => website.country)).size,
    };
  },

  async create(input: Partial<Website> & { domain: string }): Promise<Website> {
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.create(input);

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
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.update(id, patch);

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
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.getDomainIndex();

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
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.bulkUpsert(rows, mode);

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
    if (isSupabaseEnabled()) return supabaseWebsiteRepository.duplicate(id);

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
