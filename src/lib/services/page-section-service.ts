import { isSupabaseEnabled } from '@/lib/supabase/config';
import { mockStore } from './mock-store';
import { supabasePageSectionRepository } from './supabase/page-section-repository';
import type { GlobalSection, PageSection } from '@/lib/cms/sections';

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

  async listGlobals(): Promise<GlobalSection[]> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.listGlobals();
    return [...globals.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
};
