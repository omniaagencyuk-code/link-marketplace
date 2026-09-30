import { isSupabaseEnabled } from '@/lib/supabase/config';
import { mockStore } from './mock-store';
import { supabaseCustomPageRepository } from './supabase/custom-page-repository';
import {
  checkSlug,
  readTemplate,
  type PageTemplate,
  customPageDefaults,
  customPageDefinition,
  type CustomPageInput,
  type CustomPageRecord,
} from '@/lib/cms/custom-page';
import { resolvePage } from '@/lib/cms/resolve';
import { getRegisteredPage } from '@/lib/cms/registry';
import { pageContentService } from './page-content-service';
import { pageSectionService } from './page-section-service';
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

/**
 * Saved overrides layered onto shipped defaults, one section at a time.
 *
 * The same shape the CMS resolves with - a section an editor never opened
 * keeps its shipped copy rather than coming back empty - so a duplicate
 * carries what the page actually says rather than only the parts somebody
 * happened to change.
 */
function mergeValues(defaults: PageValues, saved: PageValues): PageValues {
  const merged: PageValues = { ...defaults };
  for (const [key, section] of Object.entries(saved)) {
    merged[key] = { ...(defaults[key] ?? {}), ...(section ?? {}) };
  }
  return merged;
}

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

  /** Public lookup. A draft is invisible here, which is the point. */
  async get(slug: string): Promise<CustomPageRecord | null> {
    if (isSupabaseEnabled()) return supabaseCustomPageRepository.get(slug);
    return store.get(slug) ?? null;
  },

  /** The editor's lookup, which must find drafts too. Admin only. */
  async getForAdmin(slug: string): Promise<CustomPageRecord | null> {
    if (isSupabaseEnabled()) return supabaseCustomPageRepository.getForAdmin(slug);
    return store.get(slug) ?? null;
  },

  /**
   * True when nothing - built-in route or existing custom page - holds the slug.
   *
   * Deliberately the admin lookup: a draft occupying the slug still occupies
   * it, and checking as the public would report it free and then fail on the
   * primary key.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    if (!checkSlug(slug).ok) return false;
    return (await customPageService.getForAdmin(slug)) === null;
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
      customPageDefaults(record.label, record.template),
      record.values,
    );
    return { ...resolved, record };
  },

  /**
   * Copy a page into a new one.
   *
   * The source can be a page created in the admin or one registered in code -
   * duplicating /gambling-link-building into a sports version is the case the
   * brief names, and it is the one that saves the most work.
   *
   * Three things are deliberately **not** copied:
   *
   * - **The SEO section.** A duplicated meta title and description is two
   *   pages telling Google they are the same page. Cleared, so the fallbacks
   *   apply until somebody writes them, rather than copied and quietly wrong.
   * - **The marketplace category.** A sports page inheriting the gambling
   *   page's category shows gambling publishers under a sports headline. An
   *   empty one shows the whole marketplace, which is obvious and fixable.
   * - **Published.** A copy starts as a draft, so nothing is ever briefly
   *   live carrying another page's metadata.
   *
   * Sections come with it, in order, with their variants and animations -
   * which is most of what "duplicate this page" means once a page is built
   * out of them.
   */
  async duplicate(
    from: string,
    input: { slug: string; label: string; updatedBy?: string },
  ): Promise<CustomPageRecord | null> {
    const source = await this.readForDuplication(from);
    if (!source) return null;

    const values: PageValues = { ...source.values };
    delete values.seo;
    if (values.marketplace) values.marketplace = { ...values.marketplace, niche: '' };

    const record = await this.create(input.slug, {
      label: input.label,
      template: source.template,
      description: `Copied from ${source.label}.`,
      published: false,
    });

    const saved = await this.saveValues(input.slug, values, input.updatedBy);
    await pageSectionService.copyPage(from, input.slug, input.updatedBy);

    return saved ?? record;
  },

  /**
   * The source of a duplication, whichever kind of page it is.
   *
   * A registered page's stored overrides are merged onto its code defaults
   * first, so the copy carries what the page actually says rather than only
   * the parts somebody happened to edit.
   */
  async readForDuplication(
    slug: string,
  ): Promise<{ label: string; template: PageTemplate; values: PageValues } | null> {
    const registered = getRegisteredPage(slug);
    if (registered) {
      const saved = await pageContentService.getOverrides(slug);
      return {
        label: registered.definition.label,
        /*
          A custom page can only be a service or a niche page. The homepage is
          its own template and nobody creates a second one, so duplicating it
          gives a service page carrying its copy - which is what somebody
          duplicating the homepage to start a landing page wants anyway.
        */
        template: registered.definition.template === 'niche' ? 'niche' : 'service',
        values: mergeValues(registered.defaults, saved?.values ?? {}),
      };
    }

    const custom = await this.getForAdmin(slug);
    if (!custom) return null;
    return { label: custom.label, template: custom.template, values: custom.values };
  },

  async create(slug: string, input: CustomPageInput): Promise<CustomPageRecord> {
    const record: CustomPageRecord = {
      slug,
      label: input.label,
      description: input.description,
      published: input.published,
      template: readTemplate(input.template),
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
