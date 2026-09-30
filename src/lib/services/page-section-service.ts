import { isSupabaseEnabled } from '@/lib/supabase/config';
import { mockStore } from './mock-store';
import { supabasePageSectionRepository } from './supabase/page-section-repository';
import { NO_STYLE } from '@/lib/cms/sections';
import type {
  Animation,
  GlobalSection,
  PageSection,
  SectionStyle,
  SectionValues,
} from '@/lib/cms/sections';

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
      style: NO_STYLE,
      values: input.values,
      updatedAt: new Date().toISOString(),
      updatedBy: input.updatedBy,
    };
    sections.set(section.id, section);
    return section;
  },

  async update(
    id: string,
    patch: {
      variant?: string;
      values?: SectionValues;
      animation?: Animation;
      style?: SectionStyle;
    },
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
      ...(patch.style !== undefined ? { style: patch.style } : {}),
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

    // A copy that looks like the thing it was copied from.
    await this.update(copy.id, { animation: original.animation, style: source.style }, updatedBy);

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

  /**
   * Copy every section of one page onto another, in order.
   *
   * The copies are local even where the originals were global. A duplicated
   * page pointing at the same global sections looks right and is a trap: the
   * whole point of duplicating a niche page is to change its copy, and
   * editing what looks like this page's call to action would silently rewrite
   * it on every page sharing that global.
   *
   * Locks come across, because a locked hero on the original is a locked hero
   * on the copy for the same reason it was locked in the first place.
   */
  async copyPage(from: string, to: string, updatedBy?: string): Promise<number> {
    const sections = await this.allForPage(from);

    for (const section of sections) {
      const source = section.global ?? section;
      const copy = await this.create({
        pageSlug: to,
        component: source.component,
        variant: source.variant,
        values: source.values,
        locked: section.locked,
        updatedBy,
      });
      // The look travels with the copy. A duplicated page that loses its
      // colours is a page somebody has to restyle band by band.
      await this.update(copy.id, { animation: section.animation, style: section.style }, updatedBy);
    }

    return sections.length;
  },

  /** One section by id, whatever page it is on. */
  async find(id: string): Promise<PageSection | null> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.find(id);
    return sections.get(id) ?? null;
  },

  /**
   * Turn a section into one shared across pages.
   *
   * The section keeps its place and starts rendering the global's content -
   * which is the same content it had a moment ago, so nothing visibly changes
   * on the page it was saved from. That is the point: saving as global is a
   * decision about reuse, not an edit.
   */
  async saveAsGlobal(id: string, name: string, updatedBy?: string): Promise<GlobalSection | null> {
    const section = await this.find(id);
    if (!section) return null;

    const global = isSupabaseEnabled()
      ? await supabasePageSectionRepository.createGlobal({
          name,
          component: section.component,
          variant: section.variant,
          values: section.values,
          style: section.style,
          updatedBy,
        })
      : (() => {
          const created: GlobalSection = {
            id: `global-${Date.now()}`,
            name,
            component: section.component,
            variant: section.variant,
            animation: section.animation,
            style: section.style,
            values: section.values,
            updatedAt: new Date().toISOString(),
            updatedBy,
          };
          globals.set(created.id, created);
          return created;
        })();

    await this.link(id, global.id);
    return global;
  },

  /** Point a section at a global, or stop pointing at one. */
  async link(id: string, globalId: string | null): Promise<void> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.setGlobal(id, globalId);
    const current = sections.get(id);
    if (current) sections.set(id, { ...current, globalId: globalId ?? undefined });
  },

  /**
   * Make a section its own again.
   *
   * The global's content is copied down first, so the page keeps rendering
   * exactly what it rendered - detaching is about where future edits go, not
   * about losing what is there now.
   */
  async detach(id: string, updatedBy?: string): Promise<boolean> {
    const section = await this.find(id);
    if (!section?.globalId) return false;

    const global = (await this.listGlobals()).find((entry) => entry.id === section.globalId);
    if (global) {
      await this.update(id, { variant: global.variant, values: global.values, style: global.style }, updatedBy);
    }
    await this.link(id, null);
    return true;
  },

  /** Add a section that renders a global, at the end of a page. */
  async addGlobal(pageSlug: string, globalId: string, updatedBy?: string): Promise<PageSection | null> {
    const global = (await this.listGlobals()).find((entry) => entry.id === globalId);
    if (!global) return null;

    const created = await this.create({
      pageSlug,
      component: global.component,
      variant: global.variant,
      values: {},
      locked: false,
      updatedBy,
    });
    await this.link(created.id, globalId);
    return created;
  },

  /** How many pages use each global. One query, not one per global. */
  async globalUsage(): Promise<Record<string, number>> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.globalUsage();

    const pages = new Map<string, Set<string>>();
    for (const section of sections.values()) {
      if (!section.globalId) continue;
      const seen = pages.get(section.globalId) ?? new Set<string>();
      seen.add(section.pageSlug);
      pages.set(section.globalId, seen);
    }
    return Object.fromEntries([...pages].map(([id, slugs]) => [id, slugs.size]));
  },

  async listGlobals(): Promise<GlobalSection[]> {
    if (isSupabaseEnabled()) return supabasePageSectionRepository.listGlobals();
    return [...globals.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
};
