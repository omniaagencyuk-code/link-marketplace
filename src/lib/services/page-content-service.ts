import { getRegisteredPage, listRegisteredPages } from '@/lib/cms/registry';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabasePageContentRepository } from './supabase/cms-repository';
import { mockStore } from './mock-store';
import {
  resolvePage,
  contentAccessors,
  type ContentAccessors,
  type ContentTokens,
} from '@/lib/cms/resolve';
import type { PageContentRecord, PageValues, ResolvedContent } from '@/lib/cms/types';

/**
 * Saved page content.
 *
 * Persistence is either the in-memory store or the `page_content` table,
 * chosen by `isSupabaseEnabled()`. Resolution - merging overrides onto the
 * shipped defaults - stays here in both cases, because the defaults live in
 * code and the database only ever holds the difference.
 *
 * Reads never fail on missing data: a page with no saved row resolves to its
 * shipped defaults, so the public site is never dependent on this store being
 * populated, or even reachable.
 */

const store = mockStore<PageContentRecord>('page-content');

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
    const saved = isSupabaseEnabled()
      ? await supabasePageContentRepository.getAllOverrides()
      : Object.fromEntries(store.entries());

    return listRegisteredPages().map(({ definition }) => {
      const record = saved[definition.slug];
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
    if (isSupabaseEnabled()) return supabasePageContentRepository.getOverrides(slug);
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
    const record = await pageContentService.getOverrides(slug);
    return resolvePage(page.definition, page.defaults, record?.values);
  },

  /**
   * `resolve`, wrapped in the typed accessors components use.
   *
   * `tokens` are the page's live figures - a marketplace count, say - which
   * the accessors substitute into copy wherever an editor wrote {{name}}.
   * Passing none simply means no substitution happens.
   */
  async content(
    slug: string,
    tokens: ContentTokens = {},
  ): Promise<ContentAccessors & { resolved: ResolvedContent }> {
    const resolved = await pageContentService.resolve(slug);
    if (!resolved) {
      // An unregistered slug should never reach a rendered page, but returning
      // empty accessors keeps a mistake as blank copy rather than a crash.
      const empty: ResolvedContent = { slug, values: {}, edited: false };
      return { ...contentAccessors(empty, tokens), resolved: empty };
    }
    return { ...contentAccessors(resolved, tokens), resolved };
  },

  /** Save overrides for a page. Values are validated by the caller. */
  async save(slug: string, values: PageValues, updatedBy?: string): Promise<PageContentRecord> {
    if (isSupabaseEnabled()) return supabasePageContentRepository.save(slug, values, updatedBy);

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
    if (isSupabaseEnabled()) return supabasePageContentRepository.reset(slug);
    store.delete(slug);
  },
};
