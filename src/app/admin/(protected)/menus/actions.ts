'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { menuService } from '@/lib/services/menu-service';
import { MENU_KEYS, leadsSomewhere, readMenu, type MenuKey } from '@/lib/navigation/menus';

/**
 * Saving a menu.
 *
 * What arrives from the browser is rebuilt by `readMenu` rather than filtered
 * against it, the same way `savePageContentAction` rebuilds a page's values
 * from its schema: a key nobody declared cannot survive however it was
 * posted, and an href that is not a path, an http(s) URL, a mailto or a tel
 * is dropped. These links go into the markup of every page on the site, so
 * the editor's own validation is a courtesy and this is the control.
 *
 * Every action re-checks the admin session. A server action has its own
 * endpoint and is reachable without rendering the page that offers it.
 */

export interface MenuResult {
  ok: boolean;
  error?: string;
}

function isMenuKey(value: string): value is MenuKey {
  return (MENU_KEYS as readonly string[]).includes(value);
}

/**
 * Both halves of the site have to be refreshed.
 *
 * `'layout'` and `'/'`, because this is the one piece of content that is on
 * every page rather than on one: the footer menu is in the layout of the
 * marketing group and the marketplace alike. Narrower paths would leave the
 * old menu on every page but the one somebody happened to name.
 */
function refresh() {
  revalidatePath('/', 'layout');
  revalidatePath('/admin/menus');
}

export async function saveMenuAction(key: string, items: unknown): Promise<MenuResult> {
  const admin = await requireAdminSession();

  if (!isMenuKey(key)) return { ok: false, error: 'That is not one of the three menus.' };

  const menu = readMenu(items);
  if (menu.length === 0) {
    /*
      Refused rather than stored. An empty menu is indistinguishable from no
      menu once it is read back - both render what ships - so saving one would
      look like it worked and change nothing. Resetting is the button that
      does that, and it says so.
    */
    return {
      ok: false,
      error: 'A menu needs at least one item with a label. Use Reset to put the shipped menu back.',
    };
  }

  if (!leadsSomewhere(menu)) {
    return {
      ok: false,
      error: 'Nothing in this menu has a link, so it would be navigation that does not navigate.',
    };
  }

  const saved = await menuService.save(key, menu, admin.email);
  if (!saved) return { ok: false, error: 'Could not save the menu. Nothing has been changed.' };

  refresh();
  return { ok: true };
}

/** Put the shipped menu back, by deleting the row rather than copying it. */
export async function resetMenuAction(key: string): Promise<MenuResult> {
  await requireAdminSession();

  if (!isMenuKey(key)) return { ok: false, error: 'That is not one of the three menus.' };

  const reset = await menuService.reset(key);
  if (!reset) return { ok: false, error: 'Could not reset the menu.' };

  refresh();
  return { ok: true };
}
