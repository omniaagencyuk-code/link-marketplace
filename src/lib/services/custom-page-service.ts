import { isSupabaseEnabled } from '@/lib/supabase/config';
import { mockStore } from './mock-store';
import { supabaseCustomPageRepository } from './supabase/custom-page-repository';
import {
  checkSlug,
  customPageDefaults,
  customPageDefinition,
  type CustomPageInput,
  type CustomPageRecord,
} from '@/lib/cms/custom-page';
import { resolvePage } from '@/lib/cms/resolve';
import type { PageValues, ResolvedContent } from '@/lib/cms/types';

/**
 * Pages created from the admin.
 *
 * Mirrors `pageContentService`: the same two-implementation switch, the same
 * "absence is not an error" reads. The difference is that a custom page has no
 * module behind it, so this store holds its identity as well as its content -
 * delete the row and the page is gone, rather than reverting to shipped copy.
 */

const store = mockStore<CustomPageRecord>('custom-pages');

function now() {
  return new Date().toISOString();
}

export interface CustomPageSummary {
  slug: string;
  label: string;
  path: string;
  description: string;
  published: boolean;
  updatedAt: string;
  updatedBy?: string;
}

function toSummary(record: CustomPageRecord): CustomPageSummary {
  return {
    slug: record.slug,
    label: record.label,
    path: `/${record.slug}`,
    description: record.description,
    published: record.published,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

export const customPageService = {
  /** Every custom page including drafts. Admin only - RLS enforces that too. */
  async listAll(): Promise<CustomPageSummary[]> {
    const records = isSupabaseEnabled()
      ? await supabaseCustomPageRepository.listAll()
      : [...store.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return records.map(toSummary);
  },

  /** Published pages only. Used by the sitemap and anything public. */
  async listPublished(): Promise<CustomPageSummary[]> {
    const records = isSupabaseEnabled()
      ? await supabaseCustomPageRepository.listPublished()
      : [...store.values()].filter((record) => record.published);
    return records.map(toSummary);
  },

  async get(slug: string): Promise<CustomPageRecord | null> {
    if (isSupabaseEnabled()) return supabaseCustomPageRepository.get(slug);
    return store.get(slug) ?? null;
  },

  /** True when nothing - built-in route or existing custom page - holds the slug. */
  async isSlugAvailable(slug: string): Promise<boolean> {
    if (!checkSlug(slug).ok) return false;
    return (await customPageService.get(slug)) === null;
  },

  /**
   * Content ready to render, or null when the page does not exist or is a
   * draft and the caller is not an admin.
   */
  async resolve(slug: string, options: { includeDrafts?: boolean } = {}): Promise<
    (ResolvedContent & { record: CustomPageRecord }) | null
  > {
    const record = await customPageService.get(slug);
    if (!record) return null;
    if (!record.published && !options.includeDrafts) return null;

    const resolved = resolvePage(
      customPageDefinition(record),
      customPageDefaults(record.label),
      record.values,
    );
    return { ...resolved, record };
  },

  async create(slug: string, input: CustomPageInput): Promise<CustomPageRecord> {
    const record: CustomPageRecord = {
      slug,
      label: input.label,
      description: input.description,
      published: input.published,
      // A new page starts with no overrides at all, so it renders entirely
      // from the generated defaults until an editor saves something.
      values: {},
      createdAt: now(),
      updatedAt: now(),
    };

    if (isSupabaseEnabled()) return supabaseCustomPageRepository.create(record);
    store.set(slug, record);
    return record;
  },

  /** Update the page's identity - its label, description and published state. */
  async updateSettings(
    slug: string,
    input: CustomPageInput,
    updatedBy?: string,
  ): Promise<CustomPageRecord | null> {
    if (isSupabaseEnabled()) {
      return supabaseCustomPageRepository.updateSettings(slug, input, updatedBy);
    }

    const existing = store.get(slug);
    if (!existing) return null;
    const updated: CustomPageRecord = {
      ...existing,
      ...input,
      updatedAt: now(),
      updatedBy,
    };
    store.set(slug, updated);
    return updated;
  },

  /** Save the content tree. Values are validated by the caller. */
  async saveValues(
    slug: string,
    values: PageValues,
    updatedBy?: string,
  ): Promise<CustomPageRecord | null> {
    if (isSupabaseEnabled()) return supabaseCustomPageRepository.saveValues(slug, values, updatedBy);

    const existing = store.get(slug);
    if (!existing) return null;
    const updated: CustomPageRecord = { ...existing, values, updatedAt: now(), updatedBy };
    store.set(slug, updated);
    return updated;
  },

  /** Restore the generated copy without deleting the page. */
  async resetValues(slug: string, updatedBy?: string): Promise<void> {
    await customPageService.saveValues(slug, {}, updatedBy);
  },

  async delete(slug: string): Promise<boolean> {
    if (isSupabaseEnabled()) return supabaseCustomPageRepository.delete(slug);
    return store.delete(slug);
  },
};
