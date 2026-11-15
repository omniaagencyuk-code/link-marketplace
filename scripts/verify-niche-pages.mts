/**
 * Prove the database answers a niche page exactly as the TypeScript did.
 *
 * /guest-posts/<niche> read every active listing in the niche and worked its
 * figures out here. 0097 moves that into `niche_page_stats` and
 * `niche_page_samples`, and the thing that makes such a port dangerous is
 * that it fails quietly: the page shows slightly different numbers and
 * nothing anywhere says so. Two of this week's three regressions on this page
 * were exactly that shape, and a person reading the rendered page found both.
 *
 * So neither side is trusted. The same fixtures go into a real Postgres and
 * are built as listings here; `rawStats` and `pickSamples` run against one,
 * the functions against the other, and the answers have to match - the sample
 * rows in order, because which publishers appear is the whole point of a
 * spread.
 *
 * The sizes are chosen around `spread`'s boundary. It returns the whole list
 * at or below `count` and strides over it above, and an implementation that
 * got the stride wrong still agrees on every list short enough to be returned
 * whole. Most of the fixture sets here are longer than that.
 *
 * Needs a local Postgres, the same one `verify:rls` wants:
 *   pg_ctl -D /var/tmp/pgverify -o '-k /tmp -p 5433' start
 */
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import {
  pickSamples,
  rawStats,
  type NicheListing,
  type NicheSampleRaw,
  type NicheStatsRaw,
} from '../src/lib/services/niche-landing';

const DB = 'pp_niche_pages';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0;
let fail = 0;
const ok = (m: string) => { console.log(`  PASS  ${m}`); pass += 1; };
const bad = (m: string, detail?: string) => {
  console.log(`  FAIL  ${m}${detail ? ` - ${detail}` : ''}`);
  fail += 1;
};

function psql(sql: string, db = DB): string {
  return execFileSync(
    'psql',
    ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', db, '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', cwd: ROOT },
  ).trim();
}

function psqlFile(file: string, db = DB): void {
  execFileSync(
    'psql',
    ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', '-f', file],
    { encoding: 'utf8', cwd: ROOT },
  );
}

const admin = (sql: string) =>
  execFileSync('psql', ['-h', '/tmp', '-p', '5433', '-U', 'postgres', '-c', sql], { encoding: 'utf8' });

admin(`drop database if exists ${DB}`);
admin(`create database ${DB}`);
psqlFile('supabase/tests/00_supabase_shim.sql');
for (const file of readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql') && !name.endsWith('.paste.sql'))
  .sort()) {
  psqlFile(`supabase/migrations/${file}`);
}

/* ------------------------------------------------------------------ fixtures

  One definition drives both sides. A fixture written twice is a fixture that
  disagrees with itself, and then the test proves nothing about either.
*/
/*
  `services` is unique on (website_id, type), so a listing with two services
  needs two types. The type does not affect what is being checked here:
  `lowestPriceMinor` is the minimum over the pool whatever order the types
  are in - the ordering `pricedServices` applies picks the HEADLINE price,
  which no caller on this page wants.
*/
interface Service {
  type: 'guest-post' | 'niche-edit' | 'digital-pr';
  price: number;
  available: boolean;
}

interface Fixture {
  n: number;
  niche: string | null;
  secondary: string[];
  dr: number;
  traffic: number;
  /** null: no market stated. 'default': stored but hidden, per 0044/0077. */
  country: string | null;
  countrySource: 'stated' | 'default' | null;
  services: Service[];
  status?: 'active' | 'paused';
}

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/*
  Enough listings to be past `spread`'s whole-list branch, and varied enough
  that each rule has something to get wrong: a paused row, a row in no niche,
  a row whose only service is paused, a row with no services at all, rows
  below the traffic floor, duplicate domain ratings, and a country that is
  stored but not stated.
*/
const fixtures: Fixture[] = [
  { n: 1, niche: 'business', secondary: [], dr: 80, traffic: 90_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 40_000, available: true }] },
  { n: 2, niche: 'business', secondary: [], dr: 72, traffic: 50_000, country: 'US', countrySource: 'stated', services: [{ type: 'guest-post', price: 22_000, available: true }, { type: 'niche-edit', price: 9_900, available: false }] },
  { n: 3, niche: 'finance', secondary: ['business'], dr: 72, traffic: 41_000, country: 'US', countrySource: 'stated', services: [{ type: 'guest-post', price: 31_000, available: true }] },
  { n: 4, niche: 'business', secondary: [], dr: 64, traffic: 22_000, country: 'DE', countrySource: 'stated', services: [{ type: 'guest-post', price: 18_000, available: true }] },
  { n: 5, niche: 'business', secondary: [], dr: 58, traffic: 15_000, country: null, countrySource: null, services: [{ type: 'guest-post', price: 14_000, available: true }] },
  { n: 6, niche: 'business', secondary: [], dr: 51, traffic: 9_000, country: 'FR', countrySource: 'default', services: [{ type: 'guest-post', price: 12_000, available: true }] },
  { n: 7, niche: 'business', secondary: [], dr: 44, traffic: 6_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 11_000, available: true }] },
  { n: 8, niche: 'business', secondary: [], dr: 44, traffic: 4_000, country: 'ES', countrySource: 'stated', services: [{ type: 'guest-post', price: 9_500, available: true }] },
  { n: 9, niche: 'business', secondary: [], dr: 37, traffic: 2_500, country: 'US', countrySource: 'stated', services: [{ type: 'guest-post', price: 8_000, available: true }] },
  { n: 10, niche: 'business', secondary: [], dr: 30, traffic: 1_200, country: 'IT', countrySource: 'stated', services: [{ type: 'guest-post', price: 6_500, available: true }] },
  { n: 11, niche: 'business', secondary: [], dr: 26, traffic: 800, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 5_000, available: true }] },
  { n: 12, niche: 'business', secondary: [], dr: 21, traffic: 600, country: 'NL', countrySource: 'stated', services: [{ type: 'guest-post', price: 4_200, available: true }] },
  // Below the traffic floor: counted in the band, never in the sample.
  { n: 13, niche: 'business', secondary: [], dr: 95, traffic: 120, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 3_000, available: true }] },
  // Every service paused: still has a price, per `pricedServices`.
  { n: 14, niche: 'business', secondary: [], dr: 40, traffic: 7_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 2_500, available: false }] },
  // No services at all: counted, never sampled, never the starting price.
  { n: 15, niche: 'business', secondary: [], dr: 33, traffic: 8_000, country: 'GB', countrySource: 'stated', services: [] },
  // No rating. `toStats` filters those out of the range.
  { n: 16, niche: 'business', secondary: [], dr: 0, traffic: 3_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 7_000, available: true }] },
  // Paused listing: in nothing.
  { n: 17, niche: 'business', secondary: [], dr: 88, traffic: 99_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 1_000, available: true }], status: 'paused' },
  // No niche at all, per 0077.
  { n: 18, niche: null, secondary: [], dr: 70, traffic: 30_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 2_000, available: true }] },
  /*
    A paused service cheaper than anything else in the niche.

    Without this the availability rule is untestable here: fixture 2's
    paused service is cheaper than its available one but dearer than the
    niche's minimum, so dropping the filter changes no answer. This one
    makes the two readings differ - 20,000 with the rule, 900 without - in
    the band and in its own sample row.
  */
  { n: 21, niche: 'business', secondary: [], dr: 55, traffic: 12_000, country: 'IE', countrySource: 'stated', services: [{ type: 'guest-post', price: 20_000, available: true }, { type: 'niche-edit', price: 900, available: false }] },
  // A niche with too few listings to publish, and one with none at all.
  { n: 19, niche: 'travel', secondary: [], dr: 60, traffic: 20_000, country: 'GB', countrySource: 'stated', services: [{ type: 'guest-post', price: 16_000, available: true }] },
  { n: 20, niche: 'travel', secondary: [], dr: 50, traffic: 10_000, country: 'US', countrySource: 'stated', services: [{ type: 'guest-post', price: 13_000, available: true }] },
];

for (const slug of ['business', 'finance', 'travel']) {
  psql(`insert into public.categories (slug, name) values (${sqlText(slug)}, ${sqlText(slug)})
        on conflict (slug) do nothing;`);
}

for (const f of fixtures) {
  psql(`insert into public.websites
    (id, slug, domain, title, primary_category_id, country_code, country_source,
     status, domain_rating, organic_traffic)
    values (
      ${sqlText(uuid(f.n))}, ${sqlText(`np-${f.n}`)}, ${sqlText(`np-${f.n}.example`)},
      ${sqlText(`NP ${f.n}`)},
      ${f.niche ? `(select id from public.categories where slug = ${sqlText(f.niche)})` : 'null'},
      ${f.country ? sqlText(f.country) : 'null'},
      ${f.countrySource ? sqlText(f.countrySource) : 'null'},
      ${sqlText(f.status ?? 'active')}::public.website_status,
      ${f.dr}, ${f.traffic}
    );`);

  for (const slug of f.secondary) {
    psql(`insert into public.website_categories (website_id, category_id)
          values (${sqlText(uuid(f.n))}, (select id from public.categories where slug = ${sqlText(slug)}));`);
  }
  for (const s of f.services) {
    psql(`insert into public.services
      (website_id, type, price_minor, available, turnaround_min_days, turnaround_max_days)
      values (${sqlText(uuid(f.n))}, ${sqlText(s.type)}::public.link_type, ${s.price}, ${s.available}, 3, 7);`);
  }
}

/* ------------------------------------------------- the same fixtures, as JS */

/**
 * `lowestPriceMinor` the way `toListItem` builds it: `pricedServices` takes
 * the available services where any are available and every one where none
 * are, and the lowest price is the minimum over that pool.
 */
function asListing(f: Fixture): NicheListing {
  const available = f.services.filter((s) => s.available);
  const pool = available.length > 0 ? available : f.services;

  return {
    metrics: { domainRating: f.dr, organicTraffic: f.traffic },
    lowestPriceMinor: pool.length ? Math.min(...pool.map((s) => s.price)) : 0,
    // The view hides a country whose source is 'default', so the listing a
    // page sees does not have one either.
    country: f.country && f.countrySource !== 'default' ? f.country : undefined,
  };
}

const inNiche = (f: Fixture, niche: string) =>
  (f.status ?? 'active') === 'active' && (f.niche === niche || f.secondary.includes(niche));

const listingsIn = (niche: string) => fixtures.filter((f) => inNiche(f, niche)).map(asListing);

/* --------------------------------------------------------------- the checks */

function statsFromSql(niche: string): NicheStatsRaw {
  const row = psql(
    `select listings, dr_min, dr_max, countries, coalesce(starting_price_minor::text, 'null')
       from public.niche_page_stats(${sqlText(niche)});`,
  );
  const [listings, drMin, drMax, countries, price] = row.split('|');
  return {
    listings: Number(listings),
    drMin: Number(drMin),
    drMax: Number(drMax),
    countries: Number(countries),
    startingPriceMinor: price === 'null' ? null : Number(price),
  };
}

function samplesFromSql(niche: string, count: number, minTraffic: number): NicheSampleRaw[] {
  const out = psql(
    `select domain_rating, organic_traffic, coalesce(country, ''), lowest_price_minor
       from public.niche_page_samples(${sqlText(niche)}, ${count}, ${minTraffic});`,
  );
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [dr, traffic, country, price] = line.split('|');
    return {
      domainRating: Number(dr),
      organicTraffic: Number(traffic),
      country: country ? country : undefined,
      lowestPriceMinor: Number(price),
    };
  });
}

console.log('\n--- the band at the top of the page ---');

for (const niche of ['business', 'finance', 'travel', 'igaming']) {
  const here = rawStats(listingsIn(niche));
  const there = statsFromSql(niche);

  for (const key of ['listings', 'drMin', 'drMax', 'countries', 'startingPriceMinor'] as const) {
    if (here[key] === there[key]) ok(`${niche}: ${key} agrees (${String(here[key])})`);
    else bad(`${niche}: ${key}`, `TypeScript ${String(here[key])}, SQL ${String(there[key])}`);
  }
}

/*
  The fixtures have to actually exercise each rule, or agreement is cheap.
  A suite where every niche is empty agrees perfectly and proves nothing.
*/
const business = rawStats(listingsIn('business'));
if (business.listings >= 12) ok(`business has enough listings to stride over (${business.listings})`);
else bad('business has enough listings to stride over', `only ${business.listings}`);
if (business.drMin > 0) ok('a listing with no rating is kept out of the range');
else bad('a listing with no rating is kept out of the range', `drMin ${business.drMin}`);
if (business.countries < business.listings) ok('a hidden country is not counted as a market');
else bad('a hidden country is not counted as a market');

console.log('\n--- the sample under it ---');

for (const [niche, count, minTraffic] of [
  ['business', 10, 500],
  ['business', 4, 500],
  // Above the number eligible: `spread` returns the whole list.
  ['business', 50, 500],
  // A floor that excludes almost everything.
  ['business', 10, 20_000],
  ['finance', 10, 500],
  ['travel', 10, 500],
  ['igaming', 10, 500],
] as const) {
  const here = pickSamples(listingsIn(niche), count, minTraffic);
  const there = samplesFromSql(niche, count, minTraffic);
  const label = `${niche} × ${count} rows, traffic ≥ ${minTraffic}`;

  if (here.length !== there.length) {
    bad(`${label}: same number of rows`, `TypeScript ${here.length}, SQL ${there.length}`);
    continue;
  }

  const mismatch = here.findIndex((row, index) => {
    const other = there[index]!;
    return (
      row.domainRating !== other.domainRating ||
      row.organicTraffic !== other.organicTraffic ||
      (row.country ?? '') !== (other.country ?? '') ||
      row.lowestPriceMinor !== other.lowestPriceMinor
    );
  });

  if (mismatch === -1) ok(`${label}: ${here.length} rows, identical and in order`);
  else {
    bad(
      `${label}: row ${mismatch}`,
      `TypeScript ${JSON.stringify(here[mismatch])}, SQL ${JSON.stringify(there[mismatch])}`,
    );
  }
}

/*
  And that the spread is a spread. Ten rows off the top of a list of twelve
  would agree with a broken stride on the row count and on the first row, so
  the last row is the one that tells them apart.
*/
const spreadSample = pickSamples(listingsIn('business'), 4, 500);
const eligible = listingsIn('business')
  .filter((l) => l.metrics.organicTraffic >= 500 && l.lowestPriceMinor > 0)
  .sort((a, b) => b.metrics.domainRating - a.metrics.domainRating);

if (spreadSample.length === 4) ok('a four-row sample has four rows');
else bad('a four-row sample has four rows', `${spreadSample.length}`);

if (spreadSample[3]?.domainRating === eligible[eligible.length - 1]?.metrics.domainRating) {
  ok('and its last row is the weakest listing, not the fourth strongest');
} else {
  bad(
    'and its last row is the weakest listing, not the fourth strongest',
    `got DR ${spreadSample[3]?.domainRating}, weakest is DR ${eligible[eligible.length - 1]?.metrics.domainRating}`,
  );
}

console.log(`\n-- ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
