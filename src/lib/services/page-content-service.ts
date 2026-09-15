import { getRegisteredPage, listRegisteredPages } from '@/lib/cms/registry';
import { resolvePage, contentAccessors, type ContentAccessors } from '@/lib/cms/resolve';
import type { PageContentRecord, PageValues, ResolvedContent } from '@/lib/cms/types';

/**
 * Saved page content.
 *
 * Same contract as every other service: an in-memory store today, one
 * `page_content` table tomorrow (slug primary key, values jsonb). Swapping the
 * bodies is the whole migration.
 *
 * Reads never fail on missing data - a page with no saved row resolves to its
 * shipped defaults - so the public site is never dependent on this store being
 * populated, or even reachable.
 */

const store = new Map<string, PageContentRecord>();

export interface PageSummary {
  slug: string;
  label: string;
  path: string;
  description: string;
  sectionCount: number;
  edited: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const pageContentService = {
  /** Every editable page, with whether it has been customised. */
  async list(): Promise<PageSummary[]> {
    return listRegisteredPages().map(({ definition }) => {
      const record = store.get(definition.slug);
      return {
        slug: definition.slug,
        label: definition.label,
        path: definition.path,
        description: definition.description,
        sectionCount: definition.sections.length,
        edited: Boolean(record),
        updatedAt: record?.updatedAt,
        updatedBy: record?.updatedBy,
      };
    });
  },

  /** The raw saved overrides for a page, or null. Admin editor only. */
  async getOverrides(slug: string): Promise<PageContentRecord | null> {
    return store.get(slug) ?? null;
  },

  /**
   * Defaults merged with overrides, ready to render.
   *
   * Returns null only for a slug that is not a registered page.
   */
  async resolve(slug: string): Promise<ResolvedContent | null> {
    const page = getRegisteredPage(slug);
    if (!page) return null;
    const record = store.get(slug);
    return resolvePage(page.definition, page.defaults, record?.values);
  },

  /** `resolve`, wrapped in the typed accessors components use. */
  async content(slug: string): Promise<ContentAccessors & { resolved: ResolvedContent }> {
    const resolved = await pageContentService.resolve(slug);
    if (!resolved) {
      // An unregistered slug should never reach a rendered page, but returning
      // empty accessors keeps a mistake as blank copy rather than a crash.
      const empty: ResolvedContent = { slug, values: {}, edited: false };
      return { ...contentAccessors(empty), resolved: empty };
    }
    return { ...contentAccessors(resolved), resolved };
  },

  /** Save overrides for a page. Values are validated by the caller. */
  async save(slug: string, values: PageValues, updatedBy?: string): Promise<PageContentRecord> {
    const record: PageContentRecord = {
      slug,
      values,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    store.set(slug, record);
    return record;
  },

  /** Drop every override for a page, restoring the shipped copy. */
  async reset(slug: string): Promise<void> {
    store.delete(slug);
  },
};
