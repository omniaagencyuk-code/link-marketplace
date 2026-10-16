/**
 * The header and footer menus.
 *
 * Pure rules over a stored value: no API key, no database, no network. What
 * is worth being exhaustive about is what comes *back* out of the column,
 * because this is the one piece of content that is on every page of the site
 * at once. A rule that is wrong here is wrong in the header of every page,
 * and the two directions cost differently:
 *
 *   * Too strict and a menu an editor saved renders as the shipped one, with
 *     nothing on screen saying why their link disappeared.
 *   * Too loose and whatever was typed into a box ends up in the markup of
 *     every page, which is where an href is worth more than a label.
 *
 * The last section asserts something a type cannot: that the header and the
 * footer take their menus as props rather than importing the arrays. A
 * component that imports `mainNav` directly still renders - correctly, even -
 * and no edit ever reaches it.
 */

import { readFileSync } from 'node:fs';
import {
  LIMITS,
  MENU_HELP,
  MENU_KEYS,
  MENU_LABELS,
  leadsSomewhere,
  readMenu,
  safeHref,
} from '../src/lib/navigation/menus.ts';
import { defaultMenu, defaultMenus } from '../src/lib/navigation/defaults.ts';

let checks = 0;
let failures = 0;

function ok(condition: boolean, description: string) {
  checks += 1;
  if (condition) {
    console.log(`  PASS  ${description}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL  ${description}`);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** A menu entry as it arrives from a browser or a jsonb column: shapeless. */
const entry = (fields: Record<string, unknown>) => fields;

console.log('\n--- where a menu item may point ---');

ok(safeHref('/pricing') === '/pricing', 'an internal path is kept');
ok(safeHref('/resources?category=seo') === '/resources?category=seo', 'with its query');
ok(safeHref('/resources#contact') === '/resources#contact', 'and its fragment');
ok(safeHref('https://example.com/post') === 'https://example.com/post', 'a full https URL');
ok(safeHref('HTTP://example.com') === 'HTTP://example.com', 'a scheme in capitals is still a scheme');
ok(safeHref('mailto:hello@example.com') === 'mailto:hello@example.com', 'a mailto');
ok(safeHref('tel:+441234567890') === 'tel:+441234567890', 'and a tel');

/*
  The one that is the reason this function exists. An href is the one field
  here that a browser acts on rather than displays, and it is typed into a
  box by a person.
*/
ok(safeHref('javascript:alert(1)') === '', 'javascript: is refused');
ok(safeHref('JaVaScRiPt:alert(1)') === '', 'however it is spelled');
ok(safeHref('  javascript:alert(1)  ') === '', 'and however it is padded');
ok(safeHref('data:text/html,<script>alert(1)</script>') === '', 'data: is refused');
ok(safeHref('vbscript:msgbox(1)') === '', 'and so is anything else with a scheme');

/*
  `//evil.com` is a path to this function and a different website to a
  browser: the scheme is inherited. It is the one refusal that looks like an
  internal link in the field it was typed into.
*/
ok(safeHref('//evil.com') === '', 'a protocol-relative URL is not an internal path');
ok(safeHref('/\\evil.com') === '/\\evil.com', 'but a path that merely starts with a slash is');

ok(safeHref('') === '', 'nothing is nothing');
ok(safeHref('#') === '', 'a bare hash is not navigation between pages');
ok(safeHref('#contact') === '', 'and neither is an anchor into whichever page you are on');
ok(safeHref('mailto:') === '', 'a scheme with nothing after it is not an address');
ok(safeHref(42) === '', 'a number is not an href');
ok(safeHref(null) === '', 'nor is null');
ok(safeHref({ href: '/pricing' }) === '', 'nor an object that contains one');
ok(
  safeHref(`/${'a'.repeat(LIMITS.href + 50)}`).length === LIMITS.href,
  `an href longer than ${LIMITS.href} characters is cut to fit`,
);

console.log('\n--- what comes back out of the column ---');

ok(same(readMenu(undefined), []), 'no row is no menu');
ok(same(readMenu(null), []), 'a null is no menu');
ok(same(readMenu({ label: 'Pricing' }), []), 'an object is not a menu, however menu-shaped');
ok(same(readMenu('[]'), []), 'and neither is a string holding one');

{
  const menu = readMenu([entry({ label: 'Pricing', href: '/pricing' })]);
  ok(menu.length === 1, 'one usable item is a menu of one');
  ok(menu[0]?.label === 'Pricing' && menu[0]?.href === '/pricing', 'with its label and its link');
  /*
    Every node carries an array, empty or not. The header used to branch on
    `item.children` being present; with this shape that is true of every
    item, and every item in the header would have rendered as a dropdown
    button with nothing in it.
  */
  ok(same(menu[0]?.children, []), 'and an empty children array rather than nothing');
  ok(menu[0]?.description === '', 'and an empty description rather than undefined');
}

ok(
  same(readMenu([entry({ href: '/pricing' })]), []),
  'an item with no label is dropped: a link with no words is a gap nobody can click',
);
ok(
  same(readMenu([entry({ label: '   ', href: '/pricing' })]), []),
  'and so is one whose label is only spaces',
);
ok(
  readMenu(['Pricing', 42, null, entry({ label: 'Pricing', href: '/pricing' })]).length === 1,
  'entries that are not objects are dropped and the usable one survives',
);

{
  // An unusable href does not take the item with it. The label is what makes
  // an item; a footer column heading has no link at all.
  const menu = readMenu([entry({ label: 'Pricing', href: 'javascript:alert(1)' })]);
  ok(menu.length === 1, 'an item with a refused link is kept');
  ok(menu[0]?.href === '', 'with no link rather than that one');
}

{
  const menu = readMenu([
    entry({
      label: 'Services',
      children: [
        entry({ label: 'Link building', href: '/link-building' }),
        entry({ href: '/no-label' }),
        entry({
          label: 'Guest posts',
          href: '/guest-posts',
          children: [entry({ label: 'Too deep', href: '/deeper' })],
        }),
      ],
    }),
  ]);
  ok(menu[0]?.children.length === 2, 'an unlabelled child is dropped like an unlabelled item');
  ok(
    same(menu[0]?.children[1]?.children, []),
    'a grandchild is dropped: neither a dropdown nor a column has anywhere to put one',
  );
}

ok(
  same(readMenu([entry({ label: 'Services', children: 'Link building' })])[0]?.children, []),
  'children that are not a list are no children',
);

{
  const long = Array.from({ length: LIMITS.items + 8 }, (_, index) =>
    entry({ label: `Item ${index}`, href: `/item-${index}` }),
  );
  ok(readMenu(long).length === LIMITS.items, `a menu is cut to ${LIMITS.items} items`);
  ok(readMenu(long)[0]?.label === 'Item 0', 'keeping the first rather than the last');

  const children = Array.from({ length: LIMITS.children + 5 }, (_, index) =>
    entry({ label: `Child ${index}`, href: `/child-${index}` }),
  );
  ok(
    readMenu([entry({ label: 'Services', children })])[0]?.children.length === LIMITS.children,
    `and the children under one item to ${LIMITS.children}`,
  );
}

{
  const menu = readMenu([
    entry({
      label: 'A'.repeat(LIMITS.label + 20),
      href: '/x',
      description: 'B'.repeat(LIMITS.description + 20),
    }),
  ]);
  ok(menu[0]?.label.length === LIMITS.label, `a label is cut to ${LIMITS.label} characters`);
  ok(
    menu[0]?.description.length === LIMITS.description,
    `and a description to ${LIMITS.description}`,
  );
}

ok(
  readMenu([entry({ label: '  Guest   posts  ', href: '/guest-posts' })])[0]?.label ===
    'Guest posts',
  'a pasted label is tidied: ends trimmed, a run of spaces to one',
);
ok(
  readMenu([entry({ label: 'Pricing', href: '  /pricing  ' })])[0]?.href === '/pricing',
  'and so is an href, which would otherwise be a path with a space in it',
);
ok(
  readMenu([entry({ label: 42, href: '/x' })]).length === 0,
  'a label that is a number is no label, not "42"',
);

console.log('\n--- a menu that does not navigate ---');

ok(leadsSomewhere([]) === false, 'an empty menu leads nowhere');
ok(
  leadsSomewhere(readMenu([entry({ label: 'Services' })])) === false,
  'and so does one whose every item is a bare label',
);
ok(
  leadsSomewhere(readMenu([entry({ label: 'Pricing', href: '/pricing' })])),
  'an item with a link leads somewhere',
);
/*
  The shape a footer column is: a heading with no link of its own and the
  links underneath it. `leadsSomewhere` cannot simply refuse a label with no
  href, which is why it asks about the whole menu instead.
*/
ok(
  leadsSomewhere(
    readMenu([
      entry({ label: 'Services', children: [entry({ label: 'Guest posts', href: '/guest-posts' })] }),
    ]),
  ),
  'and so does a heading whose children do',
);

console.log('\n--- what ships, when nothing is stored ---');

for (const key of MENU_KEYS) {
  const menu = defaultMenu(key);
  ok(menu.length > 0, `${key} has a shipped menu`);
  ok(leadsSomewhere(menu), `and it leads somewhere`);
  ok(menu.length <= LIMITS.items, `and fits in ${LIMITS.items} items`);

  /*
    The round trip, and the assertion that matters most in this section: the
    shipped menu has to survive the validator unchanged. If it does not, the
    editor opens showing a different menu from the one on the site, and the
    first save silently changes the navigation.
  */
  const through = readMenu(JSON.parse(JSON.stringify(menu)));
  ok(same(through, menu), `and comes back out of the validator identical`);

  for (const item of menu) {
    ok(safeHref(item.href) === item.href, `every ${key} link is one the validator keeps`);
    ok(item.children.length <= LIMITS.children, `and no item holds more than ${LIMITS.children}`);
    for (const child of item.children) {
      ok(safeHref(child.href) === child.href, `including the children's`);
      ok(same(child.children, []), 'and nothing is nested twice');
    }
    break; // One item's worth is enough; the round trip above covers the rest.
  }
}

{
  const footer = defaultMenu('footer');
  ok(
    footer.every((column) => column.children.length > 0),
    'every shipped footer column has links under it',
  );
  ok(
    footer.every((column) => column.href === ''),
    'and every column heading is a heading rather than a link',
  );

  const header = defaultMenu('header-signed-out');
  ok(
    header.some((item) => item.children.length > 0),
    'the signed-out header still has its dropdown',
  );
  ok(
    header.every((item) => item.href !== '' || item.children.length > 0),
    'and no item in it is a dead end',
  );

  const signedIn = defaultMenu('header-signed-in');
  ok(
    signedIn.every((item) => item.href.startsWith('/')),
    'every signed-in shortcut points into the site',
  );

  const all = defaultMenus();
  ok(
    MENU_KEYS.every((key) => same(all[key], defaultMenu(key))),
    'and asking for all three gives the same three',
  );
}

ok(
  MENU_KEYS.every((key) => Boolean(MENU_LABELS[key]) && Boolean(MENU_HELP[key])),
  'every menu has a name and a line explaining it, because the editor shows both',
);

console.log('\n--- the menus reach the components that draw them ---');

{
  /*
    A component that imports the arrays renders perfectly and ignores every
    edit, which is the failure this whole feature can quietly have. Nothing
    in a type system catches it: both are `MenuNode[]`, and the imported one
    is never wrong, only never edited.
  */
  const header = read('src/components/layout/site-header.tsx');
  const footer = read('src/components/layout/site-footer.tsx');

  /*
    Anchored to the import rather than to the name, which is what a mention
    in a comment satisfies either way. The property is that neither file
    reads `config/navigation` at all: both go through `defaultMenu`, which is
    the only place the arrays are turned into menus.
  */
  const importsConfig = /from '@\/lib\/config\/navigation'/;
  ok(!importsConfig.test(header), 'the header does not import the navigation arrays');
  ok(!importsConfig.test(footer), 'and neither does the footer');
  ok(
    /signedOut\?: MenuNode\[\]/.test(header) && /signedIn\?: MenuNode\[\]/.test(header),
    'the header takes both header menus as props',
  );
  ok(/menu\?: MenuNode\[\]/.test(footer), 'and the footer takes the footer menu');

  /*
    `.length > 0`, not truthiness. Every node carries a children array, so
    the old check is true for all of them - every item in the header would
    render as an empty dropdown and every footer column would draw.
  */
  ok(
    !/if \(!item\.children\)/.test(header) && !/\{item\.children \?/.test(header),
    'and it asks how many children an item has rather than whether it has any',
  );

  const marketing = read('src/app/(marketing)/layout.tsx');
  ok(/siteMenus\(\)/.test(marketing), 'the marketing layout reads the stored menus');
  ok(
    /signedOut=\{menus\['header-signed-out'\]\}/.test(marketing) &&
      /menu=\{menus\.footer\}/.test(marketing),
    'and passes them to the header and the footer',
  );

  /*
    The marketplace layout was in this loop, because it drew the public header
    and footer around a signed-out visitor. That render could not be reached -
    `/marketplace` is an inventory path in `proxy.ts`, so a request without a
    session is redirected before the layout runs - and it has been deleted, so
    the assertion that was true of it is gone with it.

    What is worth asserting is the opposite, and it is asserted rather than
    assumed: the segment draws the customer shell only, which is also why it
    no longer pays a round trip for menus nothing on the screen renders.
  */
  const marketplace = read('src/app/(app)/marketplace/layout.tsx');
  ok(
    !/siteMenus\(\)/.test(marketplace) && !/SiteHeader/.test(marketplace),
    'and the marketplace layout draws no menu, having no signed-out render',
  );

  /*
    The service is what makes an empty table safe: it falls back to the code.
    Asserted against the file because the fallback cannot be exercised from a
    clone - there is no database here, and the mock store is the other half
    of the same switch.
  */
  const service = read('src/lib/services/menu-service.ts');
  ok(/defaultMenu\(key\)/.test(service), 'and a menu with no usable row renders what ships');
  ok(
    /\.delete\(\)/.test(service) && !/defaultMenu[\s\S]{0,200}upsert/.test(service),
    'resetting a menu deletes its row rather than writing today\'s defaults into it',
  );
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} failed`);
  process.exit(1);
}
