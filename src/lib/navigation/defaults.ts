import { mainNav, memberNav, footerNav } from '@/lib/config/navigation';
import { MENU_KEYS, type MenuKey, type MenuNode } from './menus';

/**
 * What each menu is when nobody has edited it.
 *
 * The three arrays in `config/navigation.ts` are still the source: this only
 * puts them into the one shape the editor and the store use, so that the
 * fallback a visitor sees and the starting point an editor is given are the
 * same list rather than two lists that agree today.
 *
 * Icons are dropped. They belong to the internal rails - the admin sidebar
 * and the customer dashboard - and there is no field for one here, because a
 * menu an editor can add items to cannot also demand an icon per item that
 * only a developer can supply.
 */

const node = (
  label: string,
  href = '',
  description = '',
  children: MenuNode[] = [],
): MenuNode => ({ label, href, description, children });

export function defaultMenu(key: MenuKey): MenuNode[] {
  switch (key) {
    case 'header-signed-out':
      return mainNav.map((item) =>
        node(
          item.label,
          item.href,
          item.description ?? '',
          (item.children ?? []).map((child) =>
            node(child.label, child.href, child.description ?? ''),
          ),
        ),
      );

    case 'header-signed-in':
      return memberNav.map((item) => node(item.label, item.href, item.description ?? ''));

    case 'footer':
      /*
        A column heading is a parent with no link of its own. That is the whole
        difference between a footer column and a header dropdown, and it is
        expressed here rather than in a second type.
      */
      return footerNav.map((group) =>
        node(
          group.title,
          '',
          '',
          group.items.map((item) => node(item.label, item.href, item.description ?? '')),
        ),
      );
  }
}

/** Every menu's default, for the editor and for a store with no rows. */
export function defaultMenus(): Record<MenuKey, MenuNode[]> {
  return Object.fromEntries(MENU_KEYS.map((key) => [key, defaultMenu(key)])) as Record<
    MenuKey,
    MenuNode[]
  >;
}
