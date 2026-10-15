import { tidyText } from '@/lib/text/tidy';

/**
 * `tidyText` for a value out of `jsonb`, which is to say for anything at all.
 *
 * It takes a string and returns `string | undefined`; what arrives here came
 * out of a column that holds whatever was last written to it. A number, an
 * object or a null is not a label, so it becomes the empty string rather than
 * `"[object Object]"` in somebody's header.
 *
 * `tidyText` rather than the importer's `sanitiseText`, which is what the
 * page editor cleans copy with. Two reasons, and the second is the one that
 * decided it:
 *
 *   * A label is rendered as React text in the header and the footer and
 *     nowhere else, so markup in one is escaped and shows as the characters
 *     somebody typed. There is nothing here for tag stripping to protect.
 *   * This module is imported by the menu editor, which runs in the browser.
 *     `sanitiseText` lives beside the CSV importer and pulls the country
 *     table and the niche aliases in behind it - a data file apiece in the
 *     admin bundle, to validate a link.
 *
 * What it does do is the part that matters for a stored value: invisibles
 * out, runs of whitespace to one space, ends trimmed, cut to the length the
 * column and the layout can hold.
 */
const text = (value: unknown, maxChars: number): string =>
  (typeof value === 'string' ? tidyText(value, { maxChars }) : '') ?? '';

/**
 * The three menus an editor owns, and what a menu is allowed to be.
 *
 * **One shape for all three.** A header item with a dropdown and a footer
 * column are the same thing - a labelled node with children - so they share a
 * type, a validator and an editor. The alternative was a `{title, items}` for
 * the footer beside a `{label, href, children}` for the header, which is two
 * of everything to say one thing twice.
 *
 * What differs is only how each is drawn: the footer gives a parent its own
 * column and ignores its `href`, the header gives it a dropdown. That belongs
 * to the components, not here.
 *
 * ## Nothing stored means what ships
 *
 * A menu with no row, or a row that validates to nothing, renders the arrays
 * in `src/lib/config/navigation.ts`. That is the same arrangement the
 * homepage has with `PageSections`: the code is the fallback, the database is
 * the override, and deleting the row puts the shipped menu back. It is what
 * makes this safe to add to a live header - on the day it ships, nothing
 * changes - and what makes "Reset" a delete rather than a re-type.
 */

export const MENU_KEYS = ['header-signed-out', 'header-signed-in', 'footer'] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export const MENU_LABELS: Record<MenuKey, string> = {
  'header-signed-out': 'Header, signed out',
  'header-signed-in': 'Header, signed in',
  footer: 'Footer',
};

export const MENU_HELP: Record<MenuKey, string> = {
  'header-signed-out':
    'What a visitor without an account sees along the top. An item with children becomes a dropdown.',
  'header-signed-in':
    'What replaces it once somebody is signed in. These are the shortcuts into their account, so a link removed here is a door closed.',
  footer:
    'The columns across the bottom of every page. A top-level item is a column heading and needs no link of its own; its children are the links under it.',
};

export interface MenuNode {
  label: string;
  href: string;
  description: string;
  children: MenuNode[];
}

export const LIMITS = {
  label: 60,
  href: 300,
  description: 160,
  /** Top-level items. More than this and the header wraps onto two rows. */
  items: 12,
  /** Children under one item. */
  children: 12,
} as const;

/**
 * Where a menu item may point.
 *
 * An internal path, a full http(s) URL, a `mailto:` or a `tel:`. Anything else
 * is dropped rather than rendered: `javascript:` in an href is the oldest
 * cross-site scripting there is, and this field is typed by a person into a
 * box that ends up in every page's markup.
 *
 * ## Why this is not the one in `pages/actions.ts`
 *
 * That one answers the same question for a page's buttons and links, and
 * answers it with `/` when there is nothing usable - which is right there,
 * because a call to action with no destination is a broken button and the
 * homepage is the safe place to send it.
 *
 * Here nothing usable means nothing: a footer column heading is a label with
 * no link, so the empty string is a real answer and a bare `#` becomes one.
 * Returning `/` instead would turn every heading into a link to the homepage
 * and lose the only way the data has of saying "this is a heading". Two
 * call sites, two different answers for absence, so two functions rather than
 * a flag that reads as one rule and behaves as two.
 */
export function safeHref(raw: unknown): string {
  const href = text(raw, LIMITS.href);
  if (!href) return '';
  /*
    `//evil.com` is a path to a browser and a different site to everybody
    else: the scheme is inherited, so it leaves the site while looking like
    an internal link in the field an editor typed it into.
  */
  if (href.startsWith('//')) return '';
  if (href.startsWith('/')) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (/^(mailto|tel):[^\s]/i.test(href)) return href;
  return '';
}

/** One node, cleaned. Null when there is no label, because a link with no
    words is a gap in a menu nobody can click. */
function readNode(raw: unknown, depth: number): MenuNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;

  const label = text(entry.label, LIMITS.label);
  if (!label) return null;

  /*
    One level of nesting, and no more. The header draws a dropdown and the
    footer draws a column; neither has anywhere to put a grandchild, so a
    deeper tree would be stored, edited, and silently not rendered.
  */
  const children =
    depth === 0 && Array.isArray(entry.children)
      ? entry.children
          .map((child) => readNode(child, 1))
          .filter((child): child is MenuNode => child !== null)
          .slice(0, LIMITS.children)
      : [];

  return {
    label,
    href: safeHref(entry.href),
    description: text(entry.description, LIMITS.description),
    children,
  };
}

/**
 * A stored menu, read back.
 *
 * Returns an empty array for anything that is not a usable menu, which the
 * callers treat as "use what ships". Nothing here throws: this runs on the
 * way to rendering a header on every page of the site, and a malformed row is
 * a reason to show the default menu rather than a reason to show nobody
 * anything.
 */
export function readMenu(raw: unknown): MenuNode[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => readNode(entry, 0))
    .filter((entry): entry is MenuNode => entry !== null)
    .slice(0, LIMITS.items);
}

/**
 * Is this menu worth storing?
 *
 * An item that is only a label, with no link and no children, is a dead end
 * in a header - but it is exactly what a footer column heading looks like, so
 * this cannot simply refuse them. What it refuses is a menu where *nothing*
 * leads anywhere, which is the shape a half-finished edit takes and which
 * would otherwise be published as a navigation bar that does not navigate.
 */
export function leadsSomewhere(menu: MenuNode[]): boolean {
  return menu.some((item) => item.href !== '' || item.children.some((child) => child.href !== ''));
}
