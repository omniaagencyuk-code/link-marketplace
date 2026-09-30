import { getAdminScopedClient, getServerClient } from '@/lib/supabase/server';
import {
  readAnimation,
  readValues,
  type GlobalSection,
  type PageSection,
} from '@/lib/cms/sections';

/**
 * Reading and writing a page's shape.
 *
 * The read path is the part with a rule attached: **one query per page, never
 * one per section.** A page builder that fetches each section separately is a
 * page that gets slower every time somebody adds to it, and the brief is
 * explicit about not building that.
 *
 * Globals are folded in with a second read rather than an embed. A nested
 * embed is one query, but it is also the shape that failed silently on the
 * Majestic suggestions - PostgREST returns an error for a join it cannot plan,
 * and a paging loop reads that as the end of the rows. Two flat reads joined
 * in memory are boring, and boring is what a page render wants: at most two
 * queries whatever the page holds, and no rows at all if nothing is global.
 */

const SECTION_SELECT =
  'id, page_slug, component, variant, position, hidden, locked, animation, values, global_id, updated_at, updated_by';

const GLOBAL_SELECT = 'id, name, component, variant, animation, values, updated_at, updated_by';

interface SectionRow {
  id: string;
  page_slug: string;
  component: string;
  variant: string;
  position: number;
  hidden: boolean;
  locked: boolean;
  animation: unknown;
  values: unknown;
  global_id: string | null;
  updated_at: string;
  updated_by: string | null;
}

interface GlobalRow {
  id: string;
  name: string;
  component: string;
  variant: string;
  animation: unknown;
  values: unknown;
  updated_at: string;
  updated_by: string | null;
}

function mapSection(row: SectionRow): PageSection {
  return {
    id: row.id,
    pageSlug: row.page_slug,
    component: row.component,
    variant: row.variant || 'default',
    position: row.position,
    hidden: row.hidden,
    locked: row.locked,
    animation: readAnimation(row.animation),
    values: readValues(row.values),
    globalId: row.global_id ?? undefined,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

function mapGlobal(row: GlobalRow): GlobalSection {
  return {
    id: row.id,
    name: row.name,
    component: row.component,
    variant: row.variant || 'default',
    animation: readAnimation(row.animation),
    values: readValues(row.values),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

/** Attach each referenced global to the row that points at it. */
async function withGlobals(
  sections: PageSection[],
  read: (ids: string[]) => Promise<GlobalRow[]>,
): Promise<PageSection[]> {
  const ids = [...new Set(sections.map((section) => section.globalId).filter(Boolean))] as string[];
  if (ids.length === 0) return sections;

  const globals = new Map((await read(ids)).map((row) => [row.id, mapGlobal(row)]));

  return sections.map((section) =>
    section.globalId ? { ...section, global: globals.get(section.globalId) } : section,
  );
}

export const supabasePageSectionRepository = {
  /**
   * Every visible section of a page, in order, for the public render.
   *
   * Read through the anon client on purpose, so the policies apply: a hidden
   * section and a draft page's sections are refused by the database rather
   * than by remembering to filter here.
   */
  async forPage(slug: string): Promise<PageSection[]> {
    const supabase = await getServerClient();
    const { data, error } = await supabase
      .from('page_sections')
      .select(SECTION_SELECT)
      .eq('page_slug', slug)
      .eq('hidden', false)
      .order('position', { ascending: true });

    if (error) throw new Error(`Failed to read sections for "${slug}": ${error.message}`);

    return withGlobals((data ?? []).map((row) => mapSection(row as unknown as SectionRow)), async (ids) => {
      const { data: globals, error: globalError } = await supabase
        .from('global_sections')
        .select(GLOBAL_SELECT)
        .in('id', ids);
      if (globalError) throw new Error(`Failed to read global sections: ${globalError.message}`);
      return (globals ?? []) as unknown as GlobalRow[];
    });
  },

  /** Every section including the hidden ones, for the editor. */
  async allForPage(slug: string): Promise<PageSection[]> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('page_sections')
      .select(SECTION_SELECT)
      .eq('page_slug', slug)
      .order('position', { ascending: true });

    if (error) throw new Error(`Failed to read sections for "${slug}": ${error.message}`);

    return withGlobals((data ?? []).map((row) => mapSection(row as unknown as SectionRow)), async (ids) => {
      const { data: globals, error: globalError } = await supabase
        .from('global_sections')
        .select(GLOBAL_SELECT)
        .in('id', ids);
      if (globalError) throw new Error(`Failed to read global sections: ${globalError.message}`);
      return (globals ?? []) as unknown as GlobalRow[];
    });
  },

  /**
   * Which page slugs have any sections at all.
   *
   * One query for the whole site, so the renderer can decide between the
   * builder and the page's existing hardcoded render without asking per page.
   */
  async slugsWithSections(): Promise<Set<string>> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.from('page_sections').select('page_slug');
    if (error) throw new Error(`Failed to list pages with sections: ${error.message}`);
    return new Set((data ?? []).map((row) => (row as { page_slug: string }).page_slug));
  },

  async listGlobals(): Promise<GlobalSection[]> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('global_sections')
      .select(GLOBAL_SELECT)
      .order('name', { ascending: true });
    if (error) throw new Error(`Failed to list global sections: ${error.message}`);
    return (data ?? []).map((row) => mapGlobal(row as unknown as GlobalRow));
  },
};
