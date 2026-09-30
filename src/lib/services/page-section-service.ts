import { isSupabaseEnabled } from '@/lib/supabase/config';
import { mockStore } from './mock-store';
import { supabasePageSectionRepository } from './supabase/page-section-repository';
import type { Animation, GlobalSection, PageSection, SectionValues } from '@/lib/cms/sections';

/**
 * A page's sections.
 *
 * The same two-implementation switch as every other service here: Supabase
 * where it is configured, an in-memory store where it is not, so the site runs
 * and the admin works before a database exists.
 *
 * The read that matters is `forPage`, and it has one rule: **one query per
 * page, never one per section.** A builder that fetches each section
 * separately gets slower every time an editor adds to a page, which is the
 * failure mode that makes people hate page builders.
 *
 * Absence is not an error. A page with no sections is a page that has not been
 * migrated onto the builder yet, and the renderer answers that by rendering
 * what the page renders today. That fallback is the migration plan - a page
 * moves across when its rows exist and have been checked, not when the
 * migration runs.
 */

const sections = mockStore<PageSection>('page-sections');
const globals = mockStore<GlobalSection>('global-sections');

function attachGlobals(rows: PageSection[]): PageSection[] {
  return rows.map((section) =>
    section.globalId ? { ...section, global: globals.get(section.globalId) } : section,
  );
}

function fromStore(slug: string, includeHidden: boolean): PageSection[] {
  return attachGlobals(
    [...sections.values()]
      .filter((section) => section.pageSlug === slug && (includeHidden || !section.hidden))
      .sort((a, b) => a.position - b.position),
  );
}

export const pageSectionService = {
  /** Every visible section of a page, in order. What the public render uses. */
  async forPage(slug: string): Promise<PageSection[]> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.forPage(slug);
    return fromStore(slug, false);
  },

  /** Every section including the hidden ones. What the editor uses. */
  async allForPage(slug: string): Promise<PageSection[]> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.allForPage(slug);
    return fromStore(slug, true);
  },

  /**
   * Whether this page is built from sections at all.
   *
   * The renderer asks this before deciding between the builder and the page's
   * existing code. It is a read of the same rows `forPage` returns, so the
   * caller that needs both should call `forPage` and check the length rather
   * than asking twice.
   */
  async hasSections(slug: string): Promise<boolean> {
    return (await this.forPage(slug)).length > 0;
  },

  async create(input: {
    pageSlug: string;
    component: string;
    variant: string;
    values: SectionValues;
    locked: boolean;
    updatedBy?: string;
  }): Promise<PageSection> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.create(input);

    const mine = [...sections.values()].filter((s) => s.pageSlug === input.pageSlug);
    const section: PageSection = {
      id: `section-${Date.now()}-${mine.length}`,
      pageSlug: input.pageSlug,
      component: input.component,
      variant: input.variant,
      position: mine.reduce((top, s) => Math.max(top, s.position + 1), 0),
      hidden: false,
      locked: input.locked,
      animation: { entrance: 'none', speed: 'normal', delay: 'none' },
      values: input.values,
      updatedAt: new Date().toISOString(),
      updatedBy: input.updatedBy,
    };
    sections.set(section.id, section);
    return section;
  },

  async update(
    id: string,
    patch: { variant?: string; values?: SectionValues; animation?: Animation },
    updatedBy?: string,
  ): Promise<PageSection | null> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.update(id, patch, updatedBy);

    const current = sections.get(id);
    if (!current) return null;
    const next: PageSection = {
      ...current,
      ...(patch.variant !== undefined ? { variant: patch.variant } : {}),
      ...(patch.values !== undefined ? { values: patch.values } : {}),
      ...(patch.animation !== undefined ? { animation: patch.animation } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    sections.set(id, next);
    return next;
  },

  async setHidden(id: string, hidden: boolean, updatedBy?: string): Promise<void> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.setHidden(id, hidden, updatedBy);
    const current = sections.get(id);
    if (current) sections.set(id, { ...current, hidden, updatedBy });
  },

  /** Refuses a locked section, here as well as in the database. */
  async remove(id: string): Promise<boolean> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.remove(id);
    const current = sections.get(id);
    if (!current || current.locked) return false;
    sections.delete(id);
    return true;
  },

  /**
   * Copy a section, directly beneath the one it came from.
   *
   * The copy is never locked and never global, whatever the original was. A
   * duplicate of a locked hero that is itself locked cannot be moved or
   * deleted, which is not what anybody means by "duplicate"; and a duplicate
   * of a global section that is still a reference is the same section twice,
   * not a copy of it.
   */
  async duplicate(id: string, updatedBy?: string): Promise<PageSection | null> {
    const found = await this.find(id);
    if (!found) return null;

    const page = await this.allForPage(found.pageSlug);
    const original = page.find((section) => section.id === id);
    if (!original) return null;

    const source = original.global ?? original;
    const copy = await this.create({
      pageSlug: original.pageSlug,
      component: source.component,
      variant: source.variant,
      values: source.values,
      locked: false,
      updatedBy,
    });

    // create() appends. Put it directly under the original instead, which is
    // where somebody duplicating a section is looking.
    const order = page.map((section) => section.id);
    order.splice(order.indexOf(id) + 1, 0, copy.id);
    await this.reorder(original.pageSlug, order);

    return copy;
  },

  async reorder(pageSlug: string, ids: string[]): Promise<void> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.reorder(pageSlug, ids);
    ids.forEach((id, index) => {
      const current = sections.get(id);
      if (current && current.pageSlug === pageSlug) sections.set(id, { ...current, position: index });
    });
  },

  /** One section by id, whatever page it is on. */
  async find(id: string): Promise<PageSection | null> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.find(id);
    return sections.get(id) ?? null;
  },

  async listGlobals(): Promise<GlobalSection[]> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.listGlobals();
    return [...globals.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
};
