import { cache } from 'react';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient, getAdminScopedClient } from '@/lib/supabase/server';
import { mockStore } from './mock-store';
import { defaultMenu } from '@/lib/navigation/defaults';
import { MENU_KEYS, readMenu, type MenuKey, type MenuNode } from '@/lib/navigation/menus';

/**
 * The header and footer menus.
 *
 * Reads never fail on missing data, which is the rule that matters here more
 * than anywhere else in this codebase: this read sits in the layout of every
 * public page, so a menu that threw on an empty table would be a site with no
 * header. A menu with no row, a malformed row, or no database at all resolves
 * to the arrays in `src/lib/config/navigation.ts` - the same arrangement
 * `PageSections` has with its fallback.
 *
 * That is also what makes 0088 safe to deploy: on the day it ships the table
 * is empty, and an empty table is the navigation that was already there.
 */

interface MenuRow {
  key: string;
  items: unknown;
  updated_at?: string | null;
  updated_by?: string | null;
}

const store = mockStore<MenuRow>('navigation-menus');

export type SiteMenus = Record<MenuKey, MenuNode[]>;

export interface MenuSummary {
  key: MenuKey;
  items: MenuNode[];
  /** True when a row exists, so the editor can offer to put the default back. */
  edited: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

async function storedRows(): Promise<Map<string, MenuRow>> {
  if (!isSupabaseEnabled()) return new Map(store.entries());

  /*
    The anon client, not the admin one. 0088 gives this table a select policy
    for everybody because a menu is the navigation on a public page - so the
    ordinary client is enough, and reaching for the service role to read
    something anybody may read is how a service role ends up in a code path
    nobody meant to privilege.
  */
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from('navigation_menus')
    .select('key, items, updated_at, updated_by');

  // A reachable database that answered with an error is still a reason to
  // draw the shipped menu rather than no menu.
  if (error || !data) return new Map();
  return new Map((data as MenuRow[]).map((row) => [row.key, row]));
}

/**
 * Every menu, resolved.
 *
 * `cache` so the two layouts that draw a header - marketing and marketplace -
 * and anything else in one render share a single query. Every query in this
 * application is an HTTP round trip to London; a header read repeated per
 * component would be the kind of cost `/admin/diagnostics` exists to catch.
 */
export const siteMenus = cache(async (): Promise<SiteMenus> => {
  const rows = await storedRows();

  return Object.fromEntries(
    MENU_KEYS.map((key) => {
      const stored = readMenu(rows.get(key)?.items);
      // An empty result covers every way a row can fail to be a menu: no row,
      // a row holding an object, a row whose every item lost its label. All
      // of them mean "show what ships".
      return [key, stored.length > 0 ? stored : defaultMenu(key)];
    }),
  ) as SiteMenus;
});

export const menuService = {
  /** For the admin: each menu, and whether it has been customised. */
  async list(): Promise<MenuSummary[]> {
    const rows = await storedRows();

    return MENU_KEYS.map((key) => {
      const row = rows.get(key);
      const stored = readMenu(row?.items);
      const edited = Boolean(row) && stored.length > 0;
      return {
        key,
        items: edited ? stored : defaultMenu(key),
        edited,
        updatedAt: row?.updated_at ?? undefined,
        updatedBy: row?.updated_by ?? undefined,
      };
    });
  },

  /** Store a menu. The caller has already cleaned it with `readMenu`. */
  async save(key: MenuKey, items: MenuNode[], by?: string): Promise<boolean> {
    if (!isSupabaseEnabled()) {
      store.set(key, { key, items, updated_at: new Date().toISOString(), updated_by: by ?? null });
      return true;
    }

    const supabase = await getAdminScopedClient();
    const { error } = await supabase
      .from('navigation_menus')
      .upsert(
        { key, items, updated_at: new Date().toISOString(), updated_by: by ?? null },
        { onConflict: 'key' },
      );
    return !error;
  },

  /**
   * Put the shipped menu back.
   *
   * A delete rather than a write of the defaults, so that a menu restored
   * today keeps following the code tomorrow. Writing the current defaults
   * into the row would freeze them: add a page to the footer in a later
   * release and this menu would be the only one that never got it.
   */
  async reset(key: MenuKey): Promise<boolean> {
    if (!isSupabaseEnabled()) {
      store.delete(key);
      return true;
    }

    const supabase = await getAdminScopedClient();
    const { error } = await supabase.from('navigation_menus').delete().eq('key', key);
    return !error;
  },
};
