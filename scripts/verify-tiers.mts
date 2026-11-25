/**
 * Prove the domain rating price table before anybody reads a price off it.
 *
 * No API key, no database, no network. Every figure on that page is read
 * from the inventory, so what can go wrong here is not arithmetic: it is the
 * page and the marketplace behind it quoting different numbers, or a tier
 * selecting something other than what it says it selects.
 */
import { readFileSync } from 'node:fs';
import {
  MIN_SITES_FOR_A_TIER,
  TIER_SORT,
  isOffered,
  tierFilters,
  tierHref,
  tierLabel,
  tierQuery,
} from '../src/lib/tiers/rules';
import { MIN_READERS, linkTiers } from '../src/lib/config/link-tiers';
import type { LinkTier } from '../src/lib/config/link-tiers';
import { parseFilters } from '../src/lib/marketplace/filters';
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

let seq = 0;
function site(dr: number, services: { type: LinkTypeSlug; price: number; available: boolean }[]) {
  seq += 1;
  return toListItem({
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `site-${seq}`,
    domain: `site-${seq}.test`,
    title: `Site ${seq}`,
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
    metrics: { domainRating: dr, organicTraffic: 10_000, referringDomains: 100, audienceSplit: [] },
    rules: { linkAttribute: 'dofollow', acceptedNiches: [] },
    nichePrices: [],
    services: services.map((s, i) => ({
      id: `${seq}-s${i}`,
      type: s.type,
      priceMinor: s.price,
      turnaroundMinDays: 2,
      turnaroundMaxDays: 7,
      available: s.available,
    })),
    createdAt: new Date(Date.now() - seq * 86_400_000).toISOString(),
  } as unknown as Website) as WebsiteListItem;
}

// ---------------------------------------------------------------------------
console.log('\n--- the tiers that ship ---');

is('every tier has its own slug', new Set(linkTiers.map((t) => t.slug)).size, linkTiers.length);

/*
  Ascending, because the page prints them in this order and a price table
  that runs 10, 30, 20 reads as broken rather than as deliberate.
*/
isTrue(
  'the ratings climb',
  linkTiers.every((tier, i) => i === 0 || tier.drMin > linkTiers[i - 1].drMin),
);

isTrue('at most one tier is the popular one', linkTiers.filter((t) => t.popular).length <= 1);

/*
  A tier is a rating and nothing else. A price written into the config is
  one the marketplace stops charging the moment a publisher reprices, and it
  fixes a currency besides - `brand.ts` settled that we quote and charge in
  the dollars publishers bill us in.
*/
isTrue(
  'no tier writes a price or a currency into itself',
  linkTiers.every((tier) => !/[$£€]|\d+\s*(usd|gbp|eur)/i.test(JSON.stringify(tier))),
);

is('the label is derived from the rating', tierLabel({ slug: 'x', drMin: 30 }), 'DR30+');

// ---------------------------------------------------------------------------
console.log('\n--- what a tier asks the marketplace ---');

const tier: LinkTier = { slug: 'dr30', drMin: 30 };
const query = tierQuery(tier);

is('the rating floor is carried through', query.domainRating?.min, 30);

/*
  The lesson this table replaced a set of bundles over. A tier is a MINIMUM:
  capping it and then sorting from one end returns every listing sitting
  exactly on the cap, which is how three cards came to advertise "DR 45-45".
*/
is('and nothing caps it', query.domainRating?.max, undefined);

is('one row is asked for', query.pageSize, 1);
is('from the first page', query.page, 1);
is('cheapest first', query.sort, 'price-asc');
is('and unbuyable listings are excluded by a floor of one minor unit', query.price?.min, 1);

/*
  A readers floor, and the table said loudly what happens without one: all
  six tiers printed "$8 / placement", because one cheap listing with no
  audience qualifies for DR10+ and DR60+ alike and the price shown is the
  cheapest that qualifies. Six rows carrying one number are six rows saying
  nothing.
*/
is('a tier only counts listings with readers', query.organicTraffic?.min, MIN_READERS);
isTrue('and the floor is a real number', MIN_READERS > 0);

// ---------------------------------------------------------------------------
console.log('\n--- the price and the link cannot disagree ---');

/*
  The assertion this file exists for.

  "From $96" is the cheapest listing at the rating. The button beside it goes
  to the marketplace. If the two sorted differently, the page would quote one
  number while the row it lands on showed another, and the reader would be
  looking at both at once.
*/
for (const shipped of linkTiers) {
  const params = new URLSearchParams(tierHref(shipped).split('?')[1] ?? '');
  is(`${tierLabel(shipped)}: the link carries the rating it was priced at`, params.get('drMin'), String(shipped.drMin));
  is(`${tierLabel(shipped)}: and the order it was priced in`, params.get('sort'), TIER_SORT);
}

isTrue(
  'the link restores the filters the tier stands for',
  linkTiers.every((shipped) => {
    const restored = parseFilters(new URLSearchParams(tierHref(shipped).split('?')[1] ?? ''));
    return restored.drMin === shipped.drMin && restored.drMax === undefined;
  }),
);

/*
  And the readers floor goes with it. The count and the price describe
  listings above the floor; a link that dropped it would land the buyer on a
  longer, cheaper list than the row they clicked - the page and its own
  destination disagreeing, which is what this whole section exists to stop.
*/
isTrue(
  'and carries the readers floor the count was taken at',
  linkTiers.every((shipped) => {
    const restored = parseFilters(new URLSearchParams(tierHref(shipped).split('?')[1] ?? ''));
    return restored.trafficMin === MIN_READERS;
  }),
);

/*
  And the figure that sort orders by is the figure the row prints.

  `price-asc` sorts on `headlinePriceMinor`, which is the service a
  marketplace row displays, and `tierOffer` reads `headlinePriceMinor` off
  the one row it gets back. Change either and the page quotes a price the
  marketplace does not show against any row - a divergence nothing else here
  would catch, since both sides would still be internally consistent.
*/
{
  const engine = readFileSync('src/lib/services/query-engine.ts', 'utf8');
  const branch = engine.slice(engine.indexOf("case 'price-asc':"), engine.indexOf("case 'price-desc':"));
  isTrue('the cheapest-first sort orders by the price a row displays', branch.includes('headlinePriceMinor'));

  const service = readFileSync('src/lib/services/tier-offers.ts', 'utf8');
  isTrue(
    'and the per-tier read prints that same figure',
    service.includes('money(cheapest.headlinePriceMinor)'),
  );

  /*
    The other path to the same number. Where there is a database the page
    takes one read instead of six, and its "from" is `min(headline_price)`
    over `marketplace_placements` - the function `marketplace_search` itself
    sorts by. Asserted against the migration because the two paths have to
    mean the same thing, and only one of them runs from a clone.
  */
  const bands = readFileSync('supabase/migrations/0099_a_tier_needs_a_typical_price.sql', 'utf8');
  isTrue(
    'and the single read prices from the same rule the search sorts by',
    bands.includes('marketplace_placements(m.id') && bands.includes('min(s.headline_price)'),
  );
  isTrue(
    'with the middle taken over the same figure',
    bands.includes('percentile_cont(0.5) within group (order by s.headline_price)'),
  );
}

// ---------------------------------------------------------------------------
console.log('\n--- which listings a tier actually takes ---');

const shelf = [
  site(80, [{ type: 'guest-post', price: 90_000, available: true }]),
  site(45, [{ type: 'guest-post', price: 20_000, available: true }]),
  site(35, [{ type: 'guest-post', price: 12_000, available: true }]),
  site(29, [{ type: 'guest-post', price: 1_000, available: true }]),
  site(60, [{ type: 'guest-post', price: 15_000, available: false }]),
  site(55, []),
];

const taken = runQuery(shelf, { ...tierQuery(tier), pageSize: 50 });

is('a listing below the rating is left out', taken.items.some((i) => i.metrics.domainRating === 29), false);
is(
  'a listing with no readers is left out however strong it is',
  runQuery(
    [...shelf, site(95, [{ type: 'guest-post', price: 800, available: true }])].map((item) =>
      item.metrics.domainRating === 95 ? { ...item, metrics: { ...item.metrics, organicTraffic: 0 } } : item,
    ),
    { ...tierQuery(tier), pageSize: 50 },
  ).items.some((i) => i.metrics.domainRating === 95),
  false,
);
is('one at the rating or above is taken', taken.total, 3);
is('a listing whose every service is paused is not for sale', taken.items.some((i) => i.metrics.domainRating === 60), false);
is('nor is one with no services at all', taken.items.some((i) => i.metrics.domainRating === 55), false);

const priced = runQuery(shelf, tierQuery(tier));
is('and the one row back is the cheapest of them', priced.items[0]?.headlinePriceMinor, 12_000);

// ---------------------------------------------------------------------------
console.log('\n--- whether a tier is quoted at all ---');

is('a tier with too little stock is withheld', isOffered(MIN_SITES_FOR_A_TIER - 1), false);
isTrue('one with just enough is quoted', isOffered(MIN_SITES_FOR_A_TIER));
is('and an empty rating is never quoted', isOffered(0), false);

is('a tier stands for its rating and nothing else', tierFilters(tier).drMin, 30);
is('with no other filter set', tierFilters(tier).niches.length, 0);

console.log(failed === 0 ? '\nAll tier checks passed.\n' : `\n${failed} tier check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
