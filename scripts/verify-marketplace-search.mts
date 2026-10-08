/**
 * Prove the database returns exactly what the browser used to.
 *
 * The marketplace filtered client-side over every active listing. 0064 moves
 * that into SQL, and the thing that makes such a port dangerous is that it
 * fails quietly: a customer sees a slightly different set of publishers and
 * nothing anywhere says so.
 *
 * So neither side is trusted. The same fixtures are inserted into a real
 * Postgres and built as `WebsiteListItem`s, every query is run through both
 * `matchesQuery`/`sortItems` and `marketplace_search`, and the two id
 * sequences have to be identical - order included, because pagination over a
 * different tiebreak repeats rows on page two.
 *
 * Needs a local Postgres, the same one `verify:rls` wants:
 *   pg_ctl -D /var/tmp/pgverify -o '-k /tmp -p 5433' start
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { runQuery } from '../src/lib/services/query-engine';
import { forTopic } from '../src/lib/marketplace/topic';
import type { SortKey, WebsiteQuery } from '../src/lib/types/query';
import type { WebsiteListItem } from '../src/lib/types';

const DB = 'pp_search';
const ROOT = '/home/user/link-marketplace';

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
type Placement = {
  type: 'guest-post' | 'niche-edit' | 'digital-pr';
  price: number;
  available: boolean;
  turnMin: number;
  turnMax: number;
};

interface Fixture {
  n: number;
  domain: string;
  title: string;
  description: string;
  niche: string;
  secondary: string[];
  /** null means no stated market; 'default' means stored but hidden. */
  country: string | null;
  countrySource: 'stated' | 'default' | null;
  language: string;
  dr: number;
  traffic: number;
  rd: number;
  keywords: number | null;
  verified: boolean;
  completedOrders: number;
  attribute: 'dofollow' | 'nofollow';
  accepted: string[];
  services: Placement[];
  /** Topic overrides: [niche, link type, price]. */
  nichePrices: [string, Placement['type'], number][];
}

const fixtures: Fixture[] = [
  { n: 1, domain: 'alpha-casino.test', title: 'Alpha Casino News', description: 'Gambling coverage',
    niche: 'igaming', secondary: ['sports'], country: 'GB', countrySource: 'stated', language: 'en',
    dr: 72, traffic: 50000, rd: 900, keywords: 4200, verified: true, completedOrders: 12,
    attribute: 'dofollow', accepted: ['gambling', 'crypto'],
    services: [{ type: 'guest-post', price: 40000, available: true, turnMin: 2, turnMax: 5 },
               { type: 'niche-edit', price: 25000, available: true, turnMin: 1, turnMax: 3 }],
    nichePrices: [['gambling', 'guest-post', 90000]] },
  { n: 2, domain: 'beta-finance.test', title: 'Beta Finance', description: 'Money and markets',
    niche: 'finance', secondary: [], country: 'US', countrySource: 'stated', language: 'en',
    dr: 55, traffic: 12000, rd: 300, keywords: null, verified: false, completedOrders: 3,
    attribute: 'dofollow', accepted: ['forex'],
    services: [{ type: 'guest-post', price: 20000, available: true, turnMin: 3, turnMax: 9 }],
    nichePrices: [] },
  { n: 3, domain: 'gamma-tech.test', title: '', description: 'Technology writing',
    niche: 'technology', secondary: ['business'], country: 'GB', countrySource: 'default', language: 'en',
    dr: 40, traffic: 8000, rd: 150, keywords: 900, verified: true, completedOrders: 0,
    attribute: 'nofollow', accepted: [],
    services: [{ type: 'digital-pr', price: 60000, available: true, turnMin: 5, turnMax: 14 }],
    nichePrices: [] },
  { n: 4, domain: 'delta-sport.test', title: 'Delta Sport', description: 'Football and racing',
    niche: 'sports', secondary: ['igaming'], country: null, countrySource: null, language: 'de',
    dr: 61, traffic: 30000, rd: 500, keywords: 2100, verified: false, completedOrders: 7,
    attribute: 'dofollow', accepted: ['gambling'],
    services: [{ type: 'guest-post', price: 15000, available: true, turnMin: 1, turnMax: 2 },
               { type: 'digital-pr', price: 80000, available: false, turnMin: 7, turnMax: 21 }],
    nichePrices: [['gambling', 'guest-post', 30000]] },
  { n: 5, domain: 'epsilon-health.test', title: 'Epsilon Health', description: 'Wellbeing',
    niche: 'health', secondary: [], country: 'US', countrySource: 'stated', language: 'en',
    // Deliberately the same headline price as gamma-tech but a higher DR, so
    // a price sort ties and only the tiebreak can separate them. Without a
    // pair like this the order assertions pass whatever the tiebreak is.
    dr: 45, traffic: 8000, rd: 150, keywords: 900, verified: false, completedOrders: 40,
    attribute: 'dofollow', accepted: ['cbd'],
    services: [{ type: 'guest-post', price: 60000, available: false, turnMin: 4, turnMax: 10 }],
    nichePrices: [] },
  { n: 6, domain: 'zeta-travel.test', title: 'Zeta Travel', description: 'Trips and hotels',
    niche: 'travel', secondary: [], country: 'ES', countrySource: 'stated', language: 'es',
    dr: 20, traffic: 500, rd: 40, keywords: 80, verified: true, completedOrders: 1,
    attribute: 'dofollow', accepted: ['gambling', 'adult'],
    services: [{ type: 'niche-edit', price: 9000, available: true, turnMin: 2, turnMax: 4 }],
    nichePrices: [['gambling', 'niche-edit', 7000]] },
];

const uuid = (n: number) => `000000${String(n).padStart(2, '0')}-0000-4000-8000-000000000000`;

const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
const sqlArray = (values: string[]) =>
  values.length === 0 ? `'{}'::text[]` : `array[${values.map(sqlText).join(', ')}]::text[]`;

const categorySlugs = [...new Set(fixtures.flatMap((f) => [f.niche, ...f.secondary]))];
for (const slug of categorySlugs) {
  psql(`insert into public.categories (slug, name) values (${sqlText(slug)}, ${sqlText(slug)})
        on conflict (slug) do nothing;`);
}

for (const f of fixtures) {
  psql(`insert into public.websites
    (id, slug, domain, title, description, primary_category_id, country_code, country_source,
     language_code, status, verified, completed_orders, domain_rating, organic_traffic,
     referring_domains, organic_keywords, link_attribute, accepted_niches, created_at)
    values (
      ${sqlText(uuid(f.n))}, ${sqlText(f.domain.replace(/\./g, '-'))}, ${sqlText(f.domain)},
      ${sqlText(f.title)}, ${sqlText(f.description)},
      (select id from public.categories where slug = ${sqlText(f.niche)}),
      ${f.country ? sqlText(f.country) : 'null'},
      ${f.countrySource ? sqlText(f.countrySource) : 'null'},
      ${sqlText(f.language)}, 'active', ${f.verified}, ${f.completedOrders},
      ${f.dr}, ${f.traffic}, ${f.rd}, ${f.keywords ?? 'null'},
      ${sqlText(f.attribute)}::public.link_attribute, ${sqlArray(f.accepted)},
      timezone('utc', now()) - interval '${f.n} days'
    );`);

  for (const slug of f.secondary) {
    psql(`insert into public.website_categories (website_id, category_id)
          values (${sqlText(uuid(f.n))}, (select id from public.categories where slug = ${sqlText(slug)}));`);
  }
  for (const s of f.services) {
    psql(`insert into public.services
      (website_id, type, price_minor, available, turnaround_min_days, turnaround_max_days)
      values (${sqlText(uuid(f.n))}, ${sqlText(s.type)}::public.link_type, ${s.price},
              ${s.available}, ${s.turnMin}, ${s.turnMax});`);
  }
  for (const [niche, linkType, price] of f.nichePrices) {
    psql(`insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
          values (${sqlText(uuid(f.n))}, ${sqlText(niche)}, ${sqlText(linkType)}::public.link_type, ${price});`);
  }
}

/* ------------------------------------------------- the same fixtures, as JS */

function listItem(f: Fixture): WebsiteListItem {
  const services = f.services.map((s, index) => ({
    id: `${uuid(f.n)}-s${index}`,
    type: s.type,
    priceMinor: s.price,
    turnaroundMinDays: s.turnMin,
    turnaroundMaxDays: s.turnMax,
    available: s.available,
  }));
  const available = services.filter((s) => s.available);
  const pool = available.length > 0 ? available : services;
  const order = ['guest-post', 'niche-edit', 'digital-pr'];
  const ordered = [...pool].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  const headline = ordered[0] ?? null;

  return {
    id: uuid(f.n),
    slug: f.domain.replace(/\./g, '-'),
    domain: f.domain,
    // `mapWebsite`: a blank title reads as the domain, and the search text
    // uses the title, so the fallback has to be here too.
    title: f.title || f.domain,
    description: f.description,
    overview: '',
    niche: f.niche,
    secondaryNiches: f.secondary,
    // `mapWebsite` hides a country whose source is 'default'.
    country: f.countrySource === 'default' ? undefined : (f.country ?? undefined),
    language: f.language,
    status: 'active',
    verified: f.verified,
    rating: 0,
    completedOrders: f.completedOrders,
    metrics: {
      domainRating: f.dr,
      organicTraffic: f.traffic,
      referringDomains: f.rd,
      ...(f.keywords === null ? {} : { organicKeywords: f.keywords }),
    },
    rules: { linkAttribute: f.attribute, acceptedNiches: f.accepted },
    nichePrices: f.nichePrices.map(([niche, linkType, price]) => ({
      niche, linkType, priceMinor: price, agencyPriceMinor: null,
    })),
    services,
    headlineService: headline,
    headlinePriceMinor: headline?.priceMinor ?? 0,
    lowestPriceMinor: pool.length ? Math.min(...pool.map((s) => s.priceMinor)) : 0,
    fastestTurnaroundDays: headline?.turnaroundMinDays ?? 0,
    availableLinkTypes: ordered.map((s) => s.type),
    createdAt: new Date(Date.now() - f.n * 86_400_000).toISOString(),
  } as unknown as WebsiteListItem;
}

// The order a full read arrived in, which the stable JS sort tiebroke on.
const all = fixtures
  .map(listItem)
  .sort((a, b) => b.metrics.domainRating - a.metrics.domainRating || a.id.localeCompare(b.id));

/* --------------------------------------------------------------- comparison */

interface Case {
  label: string;
  query: WebsiteQuery;
  topic?: string;
  sql: string;
}

const q = (over: Partial<WebsiteQuery>): WebsiteQuery =>
  ({ page: 1, pageSize: 25, sort: 'relevance', ...over }) as WebsiteQuery;

const cases: Case[] = [
  { label: 'no filters at all', query: q({}), sql: `select * from public.marketplace_search()` },
  { label: 'a keyword search', query: q({ search: 'casino' }),
    sql: `select * from public.marketplace_search(p_search := 'casino')` },
  { label: 'two words, both of which must appear', query: q({ search: 'football racing' }),
    sql: `select * from public.marketplace_search(p_search := 'football racing')` },
  { label: 'a search matching a secondary niche', query: q({ search: 'igaming' }),
    sql: `select * from public.marketplace_search(p_search := 'igaming')` },
  { label: 'one niche', query: q({ niches: ['igaming'] }),
    sql: `select * from public.marketplace_search(p_niches := array['igaming'])` },
  { label: 'a niche held only as a secondary', query: q({ niches: ['business'] }),
    sql: `select * from public.marketplace_search(p_niches := array['business'])` },
  { label: 'a country', query: q({ countries: ['GB'] }),
    sql: `select * from public.marketplace_search(p_countries := array['GB'])` },
  { label: 'a language', query: q({ languages: ['es'] }),
    sql: `select * from public.marketplace_search(p_languages := array['es'])` },
  { label: 'a link type', query: q({ linkTypes: ['niche-edit'] }),
    sql: `select * from public.marketplace_search(p_link_types := array['niche-edit'])` },
  { label: 'a link attribute', query: q({ linkAttribute: 'nofollow' }),
    sql: `select * from public.marketplace_search(p_link_attribute := 'nofollow')` },
  { label: 'a domain rating range', query: q({ domainRating: { min: 40, max: 61 } }),
    sql: `select * from public.marketplace_search(p_dr_min := 40, p_dr_max := 61)` },
  { label: 'a traffic floor', query: q({ organicTraffic: { min: 10000 } }),
    sql: `select * from public.marketplace_search(p_traffic_min := 10000)` },
  { label: 'a referring-domains ceiling', query: q({ referringDomains: { max: 300 } }),
    sql: `select * from public.marketplace_search(p_rd_max := 300)` },
  { label: 'a price window', query: q({ price: { min: 10000, max: 45000 } }),
    sql: `select * from public.marketplace_search(p_price_min := 10000, p_price_max := 45000)` },
  { label: 'a price window within one link type', query: q({ price: { max: 30000 }, linkTypes: ['niche-edit'] }),
    sql: `select * from public.marketplace_search(p_price_max := 30000, p_link_types := array['niche-edit'])` },
  { label: 'a turnaround ceiling', query: q({ maxTurnaroundDays: 5 }),
    sql: `select * from public.marketplace_search(p_max_turnaround := 5)` },
  { label: 'vetted only', query: q({ verifiedOnly: true }),
    sql: `select * from public.marketplace_search(p_verified := true)` },
  { label: 'buying for gambling', query: q({}), topic: 'gambling',
    sql: `select * from public.marketplace_search(p_topic := 'gambling')` },
  { label: 'buying for general changes nothing', query: q({}), topic: undefined,
    sql: `select * from public.marketplace_search(p_topic := 'general')` },
  { label: 'gambling, priced and sorted cheapest first', query: q({ sort: 'price-asc' }), topic: 'gambling',
    sql: `select * from public.marketplace_search(p_topic := 'gambling', p_sort := 'price-asc')` },
  { label: 'the second page', query: q({ page: 2, pageSize: 2 }),
    sql: `select * from public.marketplace_search(p_limit := 2, p_offset := 2)` },
];

const sorts: SortKey[] = [
  'relevance', 'price-asc', 'price-desc', 'dr-asc', 'dr-desc', 'traffic-asc', 'traffic-desc',
  'rd-asc', 'rd-desc', 'kw-asc', 'kw-desc', 'turnaround-asc', 'turnaround-desc', 'newest',
];
for (const sort of sorts) {
  cases.push({
    label: `sorting by ${sort}`,
    query: q({ sort }),
    sql: `select * from public.marketplace_search(p_sort := '${sort}')`,
  });
}

for (const testCase of cases) {
  const source = forTopic(all, testCase.topic as never);
  const js = runQuery(source, testCase.query).items.map((item) => item.id);

  const rows = psql(testCase.sql).split('\n').filter(Boolean);
  const sql = rows.map((line) => line.split('|')[0] as string);

  if (js.join(',') === sql.join(',')) ok(testCase.label);
  else bad(testCase.label, `js [${js.map((id) => id.slice(6, 8)).join(' ')}] vs sql [${sql.map((id) => id.slice(6, 8)).join(' ')}]`);
}

/* --------------------------------------------------------- the derived view */

const hidden = psql(
  `select coalesce(country, 'NULL') from public.marketplace_listings where domain = 'gamma-tech.test'`,
);
if (hidden === 'NULL') ok('a country whose source is "default" is hidden, as mapWebsite hides it');
else bad('a country whose source is "default" is hidden', `got ${hidden}`);

const blankTitle = psql(`select title from public.marketplace_listings where domain = 'gamma-tech.test'`);
if (blankTitle === 'gamma-tech.test') ok('a blank title reads as the domain');
else bad('a blank title reads as the domain', `got ${blankTitle}`);

const totalFromSql = psql(`select distinct total from public.marketplace_search(p_limit := 2)`);
if (totalFromSql === String(all.length)) ok('the total counts every match, not the page');
else bad('the total counts every match, not the page', `got ${totalFromSql} of ${all.length}`);

const capped = psql(`select count(*) from public.marketplace_search(p_limit := 100000)`);
if (Number(capped) <= 100) ok('an absurd page size is capped by the database');
else bad('an absurd page size is capped by the database', `got ${capped}`);

console.log(fail === 0 ? `\n  all ${pass} passed\n` : `\n  ${fail} FAILED\n`);
process.exit(fail === 0 ? 0 : 1);
