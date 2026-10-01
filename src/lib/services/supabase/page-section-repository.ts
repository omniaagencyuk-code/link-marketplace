import { getAdminScopedClient, getServerClient } from '@/lib/supabase/server';
import {
  readAnimation,
  readDraft,
  readStyle,
  readValues,
  type Animation,
  type GlobalSection,
  type PageSection,
  type SectionDraft,
  type SectionStyle,
  type SectionValues,
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
  'id, page_slug, component, variant, position, hidden, locked, animation, style, values, global_id, updated_at, updated_by';

const GLOBAL_SELECT = 'id, name, component, variant, animation, style, values, updated_at, updated_by';

const DRAFT_SELECT = 'section_id, variant, animation, style, values';

interface SectionRow {
  id: string;
  page_slug: string;
  component: string;
  variant: string;
  position: number;
  hidden: boolean;
  locked: boolean;
  animation: unknown;
  style: unknown;
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
  style: unknown;
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
    style: readStyle(row.style),
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
    style: readStyle(row.style),
    values: readValues(row.values),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

/**
 * Attach each section's pending edit, where it has one.
 *
 * A second flat read keyed by the ids in hand, the same shape `withGlobals`
 * uses and for the same reason: a nested embed is one query and also the
 * shape that fails silently when PostgREST cannot plan the join.
 *
 * Only ever called from a path that has already established the caller is an
 * administrator. `section_drafts` has one policy and it is `is_admin()`, so a
 * visitor's request cannot read it however it is phrased - which is the whole
 * reason the drafts are not a column on a publicly readable table.
 */
async function withDrafts(
  supabase: ReturnType<typeof getAdminScopedClient>,
  sections: PageSection[],
): Promise<PageSection[]> {
  const ids = sections.map((section) => section.id);
  if (ids.length === 0) return sections;

  const { data, error } = await supabase.from('section_drafts').select(DRAFT_SELECT).in('section_id', ids);
  if (error) {
    /*
      Named, because this one failure is a migration that did not run rather
      than a bug, and because of how it presents: this query is skipped
      entirely for a page with no sections, so every unconverted page opens
      perfectly and only the converted ones die. That looks like a problem
      with one page, and it is a problem with the database.
    */
    const missing = /relation .* does not exist|could not find the table|schema cache/i.test(
      error.message,
    );
    throw new Error(
      missing
        ? `The section_drafts table is missing, so sections cannot be read. Run migration 0042_section_drafts_table.paste.sql. (${error.message})`
        : `Failed to read pending changes: ${error.message}`,
    );
  }

  const drafts = new Map(
    ((data ?? []) as Record<string, unknown>[]).map((row) => [
      row.section_id as string,
      readDraft(row),
    ]),
  );

  return sections.map((section) => {
    const draft = drafts.get(section.id);
    return draft ? { ...section, draft } : section;
  });
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

    const withPending = await withDrafts(
      supabase,
      (data ?? []).map((row) => mapSection(row as unknown as SectionRow)),
    );

    return withGlobals(withPending, async (ids) => {
      const { data: globals, error: globalError } = await supabase
        .from('global_sections')
        .select(GLOBAL_SELECT)
        .in('id', ids);
      if (globalError) throw new Error(`Failed to read global sections: ${globalError.message}`);
      return (globals ?? []) as unknown as GlobalRow[];
    });
  },

  /**
   * A page as it would look if the pending edits were published.
   *
   * The same rows the public render gets - visible only, in order - with
   * each section's draft attached. Read through the admin client, which is
   * the only client that can see the column at all.
   */
  async forPreview(slug: string): Promise<PageSection[]> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('page_sections')
      .select(SECTION_SELECT)
      .eq('page_slug', slug)
      .eq('hidden', false)
      .order('position', { ascending: true });

    if (error) throw new Error(`Failed to read sections for "${slug}": ${error.message}`);

    const withPending = await withDrafts(
      supabase,
      (data ?? []).map((row) => mapSection(row as unknown as SectionRow)),
    );

    return withGlobals(withPending, async (ids) => {
      const { data: globals, error: globalError } = await supabase
        .from('global_sections')
        .select(GLOBAL_SELECT)
        .in('id', ids);
      if (globalError) throw new Error(`Failed to read global sections: ${globalError.message}`);
      return (globals ?? []) as unknown as GlobalRow[];
    });
  },

  /** Store a pending edit, or clear one. Never touches what renders. */
  async setDraft(id: string, draft: SectionDraft | null, updatedBy?: string): Promise<void> {
    const supabase = getAdminScopedClient();

    if (!draft) {
      const { error } = await supabase.from('section_drafts').delete().eq('section_id', id);
      if (error) throw new Error(`Failed to clear the preview: ${error.message}`);
      return;
    }

    // One row per section, so staging twice replaces rather than stacks.
    const { error } = await supabase.from('section_drafts').upsert(
      {
        section_id: id,
        variant: draft.variant,
        animation: draft.animation,
        style: draft.style,
        values: draft.values,
        updated_by: updatedBy ?? null,
      },
      { onConflict: 'section_id' },
    );
    if (error) throw new Error(`Failed to save the preview: ${error.message}`);
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

  /** Add a section to the end of a page. */
  async create(input: {
    pageSlug: string;
    component: string;
    variant: string;
    values: SectionValues;
    locked: boolean;
    updatedBy?: string;
  }): Promise<PageSection> {
    const supabase = getAdminScopedClient();

    // The end of the page, whatever that currently is. Read rather than
    // counted: positions may have gaps, and a count would land on a number
    // somebody already holds.
    const { data: last } = await supabase
      .from('page_sections')
      .select('position')
      .eq('page_slug', input.pageSlug)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = ((last as { position: number } | null)?.position ?? -1) + 1;

    const { data, error } = await supabase
      .from('page_sections')
      .insert({
        page_slug: input.pageSlug,
        component: input.component,
        variant: input.variant,
        position,
        locked: input.locked,
        values: input.values,
        updated_by: input.updatedBy ?? null,
      })
      .select(SECTION_SELECT)
      .single();

    if (error) throw new Error(`Failed to add a section: ${error.message}`);
    return mapSection(data as unknown as SectionRow);
  },

  /** Change a section's content, variant or animation. */
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
    const supabase = getAdminScopedClient();
    const row: Record<string, unknown> = { updated_by: updatedBy ?? null };
    if (patch.variant !== undefined) row.variant = patch.variant;
    if (patch.values !== undefined) row.values = patch.values;
    if (patch.animation !== undefined) row.animation = patch.animation;
    if (patch.style !== undefined) row.style = patch.style;

    const { data, error } = await supabase
      .from('page_sections')
      .update(row)
      .eq('id', id)
      .select(SECTION_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Failed to save the section: ${error.message}`);

    /*
      A save publishes, so the pending edit goes with it. Leaving it would
      mean a preview that kept showing an older change than the live page -
      the one thing a preview must never do.
    */
    await supabase.from('section_drafts').delete().eq('section_id', id);

    return data ? mapSection(data as unknown as SectionRow) : null;
  },

  async setHidden(id: string, hidden: boolean, updatedBy?: string): Promise<void> {
    const supabase = getAdminScopedClient();
    const { error } = await supabase
      .from('page_sections')
      .update({ hidden, updated_by: updatedBy ?? null })
      .eq('id', id);
    if (error) throw new Error(`Failed to change the section: ${error.message}`);
  },

  /**
   * Delete a section.
   *
   * Refuses a locked one in the database rather than only in the button that
   * is hidden: a server action is an endpoint, and the hidden button is a
   * courtesy to whoever is looking at the page.
   */
  async remove(id: string): Promise<boolean> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('page_sections')
      .delete()
      .eq('id', id)
      .eq('locked', false)
      .select('id');
    if (error) throw new Error(`Failed to delete the section: ${error.message}`);
    return (data ?? []).length > 0;
  },

  /**
   * Put a page's sections in this order, in one statement.
   *
   * Through the function added in 0037 rather than a row at a time: renumbering
   * one by one collides, because the row moving to position two lands on a
   * number the old second row has not vacated. The function does the whole
   * page at once, so the deferrable constraint is checked when the order is
   * complete.
   *
   * The row count is checked, not ignored. The function returns how many rows
   * it moved, and zero means the policies refused them - which is what
   * happened to every reorder this application ever made until 0039, without
   * anything saying so. A write that reports what it did and a caller that
   * does not look at it is the same as a write that failed.
   */
  async reorder(pageSlug: string, ids: string[]): Promise<void> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('reorder_page_sections', {
      page: pageSlug,
      ordered: ids,
    });
    if (error) throw new Error(`Failed to reorder the page: ${error.message}`);

    const moved = typeof data === 'number' ? data : 0;
    if (ids.length > 0 && moved === 0) {
      throw new Error(
        'The new order was refused by the database and nothing moved. ' +
          'If migration 0039 has not been applied yet, apply it.',
      );
    }
  },

  /** One section by id, whatever page it is on. */
  async find(id: string): Promise<PageSection | null> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('page_sections')
      .select(SECTION_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Failed to read the section: ${error.message}`);
    return data ? mapSection(data as unknown as SectionRow) : null;
  },

  /** Create a global from a section's current content. */
  async createGlobal(input: {
    name: string;
    component: string;
    variant: string;
    values: SectionValues;
    style?: SectionStyle;
    updatedBy?: string;
  }): Promise<GlobalSection> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('global_sections')
      .insert({
        name: input.name,
        component: input.component,
        variant: input.variant,
        values: input.values,
        ...(input.style ? { style: input.style } : {}),
        updated_by: input.updatedBy ?? null,
      })
      .select(GLOBAL_SELECT)
      .single();

    if (error) throw new Error(`Failed to save the global section: ${error.message}`);
    return mapGlobal(data as unknown as GlobalRow);
  },

  async updateGlobal(
    id: string,
    patch: { name?: string; variant?: string; values?: SectionValues; style?: SectionStyle },
    updatedBy?: string,
  ): Promise<void> {
    const supabase = getAdminScopedClient();
    const row: Record<string, unknown> = { updated_by: updatedBy ?? null };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.variant !== undefined) row.variant = patch.variant;
    if (patch.values !== undefined) row.values = patch.values;
    if (patch.style !== undefined) row.style = patch.style;

    const { error } = await supabase.from('global_sections').update(row).eq('id', id);
    if (error) throw new Error(`Failed to save the global section: ${error.message}`);
  },

  /** Point a page's section at a global, or stop pointing at one. */
  async setGlobal(id: string, globalId: string | null): Promise<void> {
    const supabase = getAdminScopedClient();
    const { error } = await supabase
      .from('page_sections')
      .update({ global_id: globalId })
      .eq('id', id);
    if (error) throw new Error(`Failed to link the section: ${error.message}`);
  },

  /**
   * How many pages use each global.
   *
   * One query for all of them, because the editor shows the count beside
   * every global in the list - asking per global would be a query per row in
   * a list that exists to be scanned.
   */
  async globalUsage(): Promise<Record<string, number>> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('page_sections')
      .select('global_id, page_slug')
      .not('global_id', 'is', null);
    if (error) throw new Error(`Failed to count global usage: ${error.message}`);

    // Counted by page rather than by section: the same global twice on one
    // page is one page that changes when it changes.
    const pages = new Map<string, Set<string>>();
    for (const row of (data ?? []) as { global_id: string; page_slug: string }[]) {
      const seen = pages.get(row.global_id) ?? new Set<string>();
      seen.add(row.page_slug);
      pages.set(row.global_id, seen);
    }
    return Object.fromEntries([...pages].map(([id, slugs]) => [id, slugs.size]));
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
