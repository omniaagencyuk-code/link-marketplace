/**
 * Prove what a link building package costs before anybody is charged it.
 *
 * No API key, no database, no network. A package is a saved marketplace
 * search and a count, so everything that decides which listings go in the
 * basket and what they come to is arithmetic over listings - and the one
 * failure worth fearing here is silent: a page quoting a figure the checkout
 * does not charge.
 *
 * The cross-check at the end is the assertion this file exists for. The
 * package's own search decides which listings are in; `lineServiceFor`
 * decides what each one costs. Those are two rules written separately, and
 * they have to agree about `available` and about link types or a package
 * fills a basket with rows it cannot price.
 */
import {
  isOfferable,
  lineServiceFor,
  packageHref,
  packageLines,
  packageQuery,
  packageTotalMinor,
} from '../src/lib/packages/rules';
import type { LinkPackage } from '../src/lib/packages/rules';
import { linkPackages, packageBySlug } from '../src/lib/config/packages';
import { emptyFilters, parseFilters } from '../src/lib/marketplace/filters';
import { runQuery, toListItem } from '../src/lib/services/query-engine';
import type { LinkTypeSlug, Website, WebsiteListItem } from '../src/lib/types';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const isTrue = (label: string, actual: boolean) => (actual ? ok(label) : bad(label, 'expected true'));

// ---------------------------------------------------------------------------
// Fixtures, built through `toListItem` rather than by hand, so the denormalised
// fields are the ones production computes rather than this file's idea of them.
// ---------------------------------------------------------------------------
type Placement = { type: LinkTypeSlug; price: number; available: boolean };

let seq = 0;

function site(
  options: { dr?: number; traffic?: number; services: Placement[] },
): WebsiteListItem {
  seq += 1;
  const n = seq;

  const website = {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    slug: `site-${n}`,
    domain: `site-${n}.test`,
    title: `Site ${n}`,
    description: '',
    overview: '',
    niche: 'business',
    secondaryNiches: [],
    country: 'US',
    language: 'en',
    status: 'active',
    verified: true,
    rating: 0,
    completedOrders: 0,
    metrics: {
      domainRating: options.dr ?? 50,
      organicTraffic: options.traffic ?? 20_000,
      referringDomains: 500,
      audienceSplit: [],
    },
    rules: { linkAttribute: 'dofollow', acceptedNiches: [] },
    nichePrices: [],
    services: options.services.map((service, index) => ({
      id: `${n}-s${index}`,
      type: service.type,
      priceMinor: service.price,
      turnaroundMinDays: 2,
      turnaroundMaxDays: 7,
      available: service.available,
    })),
    createdAt: new Date(Date.now() - n * 86_400_000).toISOString(),
  } as unknown as Website;

  return toListItem(website);
}

const pkg = (over: Partial<LinkPackage> = {}): LinkPackage => ({
  slug: 'test',
  name: 'Test',
  blurb: 'A test package.',
  filters: { ...emptyFilters },
  count: 3,
  sort: 'dr-desc',
  ...over,
});

// ---------------------------------------------------------------------------
console.log('\n--- what one listing costs a package ---');

is(
  'the cheapest available service is the one bought',
  lineServiceFor(
    site({ services: [
      { type: 'guest-post', price: 40_000, available: true },
      { type: 'niche-edit', price: 15_000, available: true },
    ] }),
    [],
  )?.priceMinor,
  15_000,
);

/*
  The reason this is not `item.lowestPriceMinor`. That figure is a minimum
  over `pricedServices`, which falls back to paused services when a listing
  has none available - right for a listing card's "from", wrong for a basket.
*/
is(
  'a paused service is never bought, however cheap',
  lineServiceFor(
    site({ services: [
      { type: 'guest-post', price: 40_000, available: true },
      { type: 'niche-edit', price: 9_000, available: false },
    ] }),
    [],
  )?.priceMinor,
  40_000,
);

/*
  The bug this rule exists for. A guest-post package priced off the listing's
  lowest figure would quote the publisher's cheaper niche edit and then
  charge the guest post.
*/
const mixed = site({ services: [
  { type: 'guest-post', price: 40_000, available: true },
  { type: 'niche-edit', price: 12_000, available: true },
] });
is(
  'a guest-post package does not quote a cheaper niche edit',
  lineServiceFor(mixed, ['guest-post'])?.priceMinor,
  40_000,
);
is(
  "and it is the guest post that goes in the basket, not just its price",
  lineServiceFor(mixed, ['guest-post'])?.type,
  'guest-post',
);

is(
  'a listing offering nothing the package buys has no price',
  lineServiceFor(
    site({ services: [{ type: 'digital-pr', price: 60_000, available: true }] }),
    ['guest-post'],
  ),
  null,
);

// Null, not a line priced at nothing: a listing we cannot sell has no price.
is(
  'a listing with every service paused has no price, not a price of zero',
  lineServiceFor(
    site({ services: [{ type: 'guest-post', price: 30_000, available: false }] }),
    [],
  ),
  null,
);

/*
  Two services at one price would otherwise be separated by whatever order
  the rows arrived in, and a basket that differs between two reads of the
  same package is one the page cannot describe.
*/
is(
  'a tie in price is broken the way list views order services',
  lineServiceFor(
    site({ services: [
      { type: 'niche-edit', price: 20_000, available: true },
      { type: 'guest-post', price: 20_000, available: true },
    ] }),
    [],
  )?.type,
  'guest-post',
);

is(
  'naming no link types lets the package buy any of them',
  lineServiceFor(
    site({ services: [{ type: 'digital-pr', price: 60_000, available: true }] }),
    [],
  )?.type,
  'digital-pr',
);

// ---------------------------------------------------------------------------
console.log('\n--- the search behind a package ---');

const plain = packageQuery(pkg({ count: 7, sort: 'traffic-desc' }));
is('the page size is the package count', plain.pageSize, 7);
is('and it asks for the first page', plain.page, 1);
is('the package sort is the query sort', plain.sort, 'traffic-desc');

/*
  How "buyable" is said in this query language: the marketplace's price
  filter counts only services that are `available`, so a floor of one minor
  unit excludes the unpriced listing and the all-paused one together.
*/
is('an unpriced listing is excluded by a floor of one minor unit', plain.price?.min, 1);
is('and nothing caps the price unless the package does', plain.price?.max, undefined);

const bounded = packageQuery(pkg({ filters: { ...emptyFilters, priceMin: 150, priceMax: 400 } }));
is("a package's own minimum survives, in minor units", bounded.price?.min, 15_000);
is('as does its maximum', bounded.price?.max, 40_000);

// ---------------------------------------------------------------------------
console.log('\n--- which listings become lines ---');

const three = pkg({ count: 3 });
const plenty = [
  site({ services: [{ type: 'guest-post', price: 10_000, available: true }] }),
  site({ services: [{ type: 'guest-post', price: 20_000, available: true }] }),
  site({ services: [{ type: 'guest-post', price: 30_000, available: true }] }),
  site({ services: [{ type: 'guest-post', price: 40_000, available: true }] }),
];
is('a package takes its count and no more', packageLines(three, plenty).length, 3);
is(
  'in the order the search returned them',
  packageLines(three, plenty).map((line) => line.service.priceMinor).join(','),
  '10000,20000,30000',
);

/*
  A listing the package cannot buy is skipped rather than counted. Counting
  it would be a short delivery dressed up as a cheap package.
*/
const withDud = [
  site({ services: [{ type: 'guest-post', price: 10_000, available: true }] }),
  site({ services: [{ type: 'niche-edit', price: 5_000, available: true }] }),
  site({ services: [{ type: 'guest-post', price: 30_000, available: true }] }),
  site({ services: [{ type: 'guest-post', price: 40_000, available: true }] }),
];
const guestOnly = pkg({ count: 3, filters: { ...emptyFilters, linkTypes: ['guest-post'] } });
is(
  'a listing it cannot buy is skipped and the next one taken instead',
  packageLines(guestOnly, withDud).map((line) => line.service.priceMinor).join(','),
  '10000,30000,40000',
);

is(
  'and a short list yields short, rather than inventing a line',
  packageLines(pkg({ count: 10 }), plenty).length,
  4,
);

// ---------------------------------------------------------------------------
console.log('\n--- what the package costs ---');

is('the total is the sum of the services the lines name', packageTotalMinor(packageLines(three, plenty)), 60_000);

// "From $0" is not a price, and a package with no contents is not a free one.
is('nothing to sell is no price, never a price of zero', packageTotalMinor([]), null);

const lines = packageLines(three, plenty);
is(
  'and the total counts exactly the services the basket would order',
  packageTotalMinor(lines),
  lines.reduce((sum, line) => sum + line.service.priceMinor, 0),
);

// ---------------------------------------------------------------------------
console.log('\n--- whether a package is offered at all ---');

is('a package that cannot be filled is withheld', isOfferable(pkg({ count: 10 }), packageLines(pkg({ count: 10 }), plenty)), false);
isTrue('one that can be filled exactly is offered', isOfferable(three, packageLines(three, plenty)));

// ---------------------------------------------------------------------------
console.log('\n--- the shipped packages ---');

is(
  'every package has its own slug',
  new Set(linkPackages.map((entry) => entry.slug)).size,
  linkPackages.length,
);
isTrue('and each can be found by it', linkPackages.every((entry) => packageBySlug(entry.slug) === entry));
is('a slug nobody ships finds nothing', packageBySlug('no-such-package'), null);

/*
  No figure may be typed into the copy. A price written here is one the
  checkout does not charge the moment a publisher reprices, and it would
  bake in a currency besides - `brand.ts` settled that we quote and charge
  in the dollars publishers bill us in.
*/
isTrue(
  'no package writes a price into its words',
  linkPackages.every((entry) => !/[$£€]|\d[\d,]*\s*(usd|gbp|eur)\b/i.test(`${entry.name} ${entry.blurb}`)),
);
isTrue('and every package buys at least one placement', linkPackages.every((entry) => entry.count >= 1));

/*
  Every package requires readers.

  Starter shipped without this and the first production render showed what
  that costs: five DR 45 listings at `0` organic traffic, under a sentence
  promising "real readers". A strong rating with nobody reading is the thing
  buyers in this industry are most often sold, and a package is us doing the
  choosing, so the floor is ours to set rather than the buyer's to notice.
*/
isTrue(
  'no package sells a placement with no readers',
  linkPackages.every((entry) => (entry.filters.trafficMin ?? 0) > 0),
);

/*
  A package must not sort by a measure its own filter caps.

  `dr-desc` inside `drMax: 45` hands back every match sitting exactly at 45,
  because with twelve thousand listings there are more than enough of them to
  fill the package - so the card advertised "DR 45-45" and read as broken.
  The sort decides both the contents and the price, so this is not only a
  presentation fault: it buys the narrowest slice of the band every time.

  Stated as the general rule rather than as "do not use dr-desc", because the
  same trap is waiting on traffic and on referring domains the day somebody
  caps one of those.
*/
const CAPPED_BY: Record<string, keyof typeof emptyFilters> = {
  'dr-desc': 'drMax',
  'traffic-desc': 'trafficMax',
  'rd-desc': 'rdMax',
};
isTrue(
  'no package sorts down a measure it has capped',
  linkPackages.every((entry) => {
    const capped = CAPPED_BY[entry.sort];
    return capped === undefined || entry.filters[capped] === undefined;
  }),
);

/*
  "Browse all of them" has to land on the set the figures describe, so the
  href must carry the filters the price was computed from.
*/
isTrue(
  'the browse link restores the filters the package was priced from',
  linkPackages.every((entry) => {
    const query = packageHref(entry).split('?')[1] ?? '';
    const restored = parseFilters(new URLSearchParams(query));

    /*
      Key by key, not by `JSON.stringify` of the whole object. Both sides
      carry the same filters and `stringify` compares the order they were
      written in too, so the first version of this failed on three packages
      whose values all round-tripped perfectly.
    */
    const keys = new Set([...Object.keys(entry.filters), ...Object.keys(restored)]);

    return [...keys].every(
      (key) =>
        JSON.stringify((entry.filters as Record<string, unknown>)[key]) ===
        JSON.stringify((restored as unknown as Record<string, unknown>)[key]),
    );
  }),
);

// ---------------------------------------------------------------------------
console.log('\n--- the filter and the price rule agree ---');

/*
  The assertion this file exists for.

  A package's search decides which listings are in. `lineServiceFor` decides
  what each costs. Those are two rules, written separately, and both have to
  take the same view of `available` and of link types. If the search admits a
  listing the pricing rule will not buy, a package quietly delivers short.

  Run over a shelf holding every awkward case: paused services, a type the
  package does not buy, a listing priced only on something else.
*/
const shelf = [
  site({ dr: 90, services: [{ type: 'guest-post', price: 50_000, available: true }] }),
  site({ dr: 80, services: [{ type: 'guest-post', price: 30_000, available: false }] }),
  site({ dr: 70, services: [{ type: 'niche-edit', price: 8_000, available: true }] }),
  site({ dr: 60, services: [
    { type: 'guest-post', price: 25_000, available: true },
    { type: 'niche-edit', price: 9_000, available: false },
  ] }),
  site({ dr: 50, services: [{ type: 'digital-pr', price: 70_000, available: true }] }),
  site({ dr: 40, services: [] }),
];

for (const linkTypes of [[], ['guest-post'], ['guest-post', 'niche-edit']] as LinkTypeSlug[][]) {
  const candidate = pkg({ count: 6, filters: { ...emptyFilters, linkTypes } });
  const admitted = runQuery(shelf, packageQuery(candidate)).items;

  isTrue(
    `every listing the search admits can be bought (link types: ${linkTypes.join('+') || 'any'})`,
    admitted.length > 0 && admitted.every((item) => lineServiceFor(item, linkTypes) !== null),
  );

  // And the converse, so the pair is pinned from both sides: nothing the
  // package could buy is left out of its own search.
  const buyable = shelf.filter((item) => lineServiceFor(item, linkTypes) !== null);
  is(
    `and the search admits everything it could buy (link types: ${linkTypes.join('+') || 'any'})`,
    admitted.length,
    buyable.length,
  );
}

/*
  The same claim stated against a package that caps its price: the cap is the
  marketplace's rule, so a listing priced above it must not arrive, and one
  priced under it must.
*/
const capped = pkg({ count: 6, filters: { ...emptyFilters, linkTypes: ['guest-post'], priceMax: 300 } });
const underCap = runQuery(shelf, packageQuery(capped)).items;
isTrue(
  'a price cap keeps the dear listings out and the cheap ones in',
  underCap.length === 1 && lineServiceFor(underCap[0], ['guest-post'])?.priceMinor === 25_000,
);

console.log(failed === 0 ? '\nAll package checks passed.\n' : `\n${failed} package check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
