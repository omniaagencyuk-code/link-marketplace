/**
 * Prove the Link Building Planner's rules without a database.
 *
 * No API key, no database, no network, and - the point of the feature -
 * no paid lookup of any kind. Everything here is arithmetic over a
 * customer's own rows: what a month adds up to, which rows a filter keeps,
 * what order they come back in, and what a spreadsheet becomes on the way
 * in and out.
 *
 * The rule most of these are really about is the same one: a blank is not
 * a zero. A planner is a half-filled spreadsheet by design, and every
 * figure it reports is wrong the moment an empty cell is counted as
 * nothing-spent, a DR of zero, or a refusal.
 */
import {
  domainKey,
  looksLikeDomain,
  monthStart,
  monthLabel,
  shiftMonth,
} from '../src/lib/planner/domain-key';
import {
  DEFAULT_SORT,
  NO_FILTER,
  activeFilterCount,
  compareLinks,
  filterIsActive,
  filterParams,
  matchesFilter,
  readFilter,
  readSort,
  statusOrdering,
  type PlannerFilter,
} from '../src/lib/planner/filter';
import { summariseMonth } from '../src/lib/planner/summary';
import { CSV_HEADERS, linksToCsv, mapHeaders, readImport } from '../src/lib/planner/csv';
import type { PlannerLink, PlannerStatus } from '../src/lib/types/planner';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const isTrue = (label: string, actual: boolean) => (actual ? ok(label) : bad(label, 'expected true'));
const isFalse = (label: string, actual: boolean) =>
  actual ? bad(label, 'expected false') : ok(label);

// ---------------------------------------------------------------------------
console.log('\n--- what a domain is ---');

is('a URL becomes its host', domainKey('https://Forbes.com/some/path?x=1'), 'forbes.com');
is('one leading www is dropped', domainKey('www.forbes.com'), 'forbes.com');
/*
  And no other subdomain is. `blog.example.com` and `example.com` are two
  publishers who may well charge different prices, and collapsing them
  would merge two rows that are not the same placement.
*/
is('but no other subdomain is', domainKey('blog.example.com'), 'blog.example.com');
is('a trailing dot and port go', domainKey('Example.com.:8080'), 'example.com');
isTrue('a plain domain looks like one', looksLikeDomain('forbes.com'));
isFalse('a sentence does not', looksLikeDomain('not a domain at all'));
isFalse('and neither does a bare word', looksLikeDomain('forbes'));

is('a month is the first of it', monthStart('2026-10-17'), '2026-10-01');
is('and a month already is', monthStart('2026-10-01'), '2026-10-01');
is('stepping back over a year boundary works', shiftMonth('2026-01-01', -1), '2025-12-01');
is('and forward over one too', shiftMonth('2026-12-01', 1), '2027-01-01');
is('a month reads as a month', monthLabel('2026-10-01'), 'October 2026');

// ---------------------------------------------------------------------------
console.log('\n--- what a month adds up to ---');

const statuses: PlannerStatus[] = [
  { id: 's-plan', name: 'Planned', colour: '#64748b', category: 'planned', sortOrder: 10, archivedAt: null },
  { id: 's-live', name: 'Live', colour: '#059669', category: 'live', sortOrder: 90, archivedAt: null },
  { id: 's-lost', name: 'Lost', colour: '#dd4a20', category: 'lost', sortOrder: 100, archivedAt: null },
];

const row = (over: Partial<Parameters<typeof summariseMonth>[0][number]> = {}) => ({
  statusId: 's-plan',
  linkType: 'Guest Post',
  anchorType: 'Branded',
  priceMinor: 10000,
  currency: 'GBP',
  paymentStatus: 'unpaid' as const,
  paidMinor: null,
  ...over,
});

/*
  The assertion the whole budget card rests on. A row with no price is not
  a row that cost nothing, and a month of unpriced rows must not report a
  spend of zero and a budget untouched - it must report that it does not
  know.
*/
const blanks = summariseMonth([row({ priceMinor: null }), row({ priceMinor: null })], statuses, {
  target: null,
  budgetMinor: 100000,
  currency: 'GBP',
});
is('two unpriced rows commit nothing', blanks.committedMinor, 0);
is('and nothing has been paid', blanks.paidMinor, 0);
is('no target means no progress figure, rather than 0%', blanks.progress, null);

const month = summariseMonth(
  [
    row({ statusId: 's-live', paymentStatus: 'paid' }),
    row({ statusId: 's-live', paymentStatus: 'partially_paid', paidMinor: 4000 }),
    row({ statusId: 's-lost', priceMinor: 50000 }),
    row({ priceMinor: 20000 }),
  ],
  statuses,
  { target: 4, budgetMinor: 100000, currency: 'GBP' },
);
is('paid counts the full price of a paid row plus the part of a partial', month.paidMinor, 14000);
/*
  Committed is what is still going to be paid: the two live rows' unpaid
  remainder (0 + 6,000) and the planned row (20,000). The lost row is not
  in it - a placement that fell through is not money we owe.
*/
is('committed excludes the lost row', month.committedMinor, 26000);
is('and the budget left is the budget less both', month.remainingMinor, 100000 - 14000 - 26000);
is('progress counts live against the target', month.progress, 50);
is('the live count is two', month.byCategory.live, 2);

/*
  A euro row is counted apart and named, never converted. There is no
  exchange-rate source in this application, and a rate fetched today
  applied to an invoice paid in March is a figure that looks precise and
  is not.
*/
const mixed = summariseMonth([row(), row({ currency: 'EUR', priceMinor: 90000 })], statuses, {
  target: null,
  budgetMinor: 100000,
  currency: 'GBP',
});
is('a row in another currency is not added to the total', mixed.committedMinor, 10000);
is('it is counted apart', mixed.otherCurrencies[0]?.count, 1);
is('and named', mixed.otherCurrencies[0]?.currency, 'EUR');

// ---------------------------------------------------------------------------
console.log('\n--- which rows a filter keeps ---');

const link = (over: Partial<PlannerLink> = {}): PlannerLink => ({
  id: 'l1',
  projectId: 'p1',
  planMonth: '2026-10-01',
  domain: 'forbes.com',
  domainKey: 'forbes.com',
  source: 'Outreach',
  domainRating: 92,
  organicTraffic: 1000,
  organicKeywords: null,
  referringDomains: null,
  metricsSource: 'manual',
  metricsUpdatedAt: null,
  linkType: 'Guest Post',
  targetUrl: null,
  anchorText: 'best betting sites',
  anchorType: 'Exact Match',
  statusId: 's-plan',
  plannedDate: '2026-10-15',
  liveDate: null,
  liveUrl: null,
  priceMinor: 30000,
  currency: 'GBP',
  paymentStatus: 'unpaid',
  paidMinor: null,
  notes: '',
  orderItemId: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

const filter = (over: Partial<PlannerFilter> = {}): PlannerFilter => ({ ...NO_FILTER, ...over });

isTrue('an empty filter keeps everything', matchesFilter(link(), NO_FILTER));
isFalse('and reports itself as not set', filterIsActive(NO_FILTER));

isTrue('a domain search matches part of the domain', matchesFilter(link(), filter({ domain: 'forb' })));
isTrue('and ignores case', matchesFilter(link(), filter({ domain: 'FORB' })));
isFalse('and does not match something else', matchesFilter(link(), filter({ domain: 'bbc' })));
isTrue('an anchor search looks at the anchor', matchesFilter(link(), filter({ anchor: 'betting' })));

isTrue('a status filter keeps a matching row', matchesFilter(link(), filter({ statusIds: ['s-plan'] })));
isFalse('and drops the rest', matchesFilter(link(), filter({ statusIds: ['s-live'] })));
isTrue(
  'several statuses are an or, not an and',
  matchesFilter(link(), filter({ statusIds: ['s-live', 's-plan'] })),
);

/*
  The blank rule again, in the one place it costs money to get wrong. "Under
  £100" must not be a list of every row nobody has negotiated yet, and
  "over £100" must not quietly contain them either.
*/
isFalse(
  'a price floor excludes a row with no price',
  matchesFilter(link({ priceMinor: null }), filter({ priceMinMinor: 1 })),
);
isFalse(
  'and so does a price ceiling',
  matchesFilter(link({ priceMinor: null }), filter({ priceMaxMinor: 10000000 })),
);
/*
  The floor assertion above passes even if a blank is read as zero, because
  zero is below any positive floor. This is the one that does not: "£0 and
  up" is still a question about rows that have a price, and a blank read as
  zero would sweep every unresearched row into it.
*/
isFalse(
  'even a floor of zero is a question about rows that have a price',
  matchesFilter(link({ priceMinor: null }), filter({ priceMinMinor: 0 })),
);
isTrue('a price inside the range is kept', matchesFilter(link(), filter({ priceMinMinor: 20000, priceMaxMinor: 40000 })));
isFalse('and one below it is not', matchesFilter(link({ priceMinor: 100 }), filter({ priceMinMinor: 20000 })));

isFalse(
  'a date range excludes a row with no planned date',
  matchesFilter(link({ plannedDate: null }), filter({ plannedFrom: '2026-10-01' })),
);
isTrue(
  'and keeps one inside it',
  matchesFilter(link(), filter({ plannedFrom: '2026-10-01', plannedTo: '2026-10-31' })),
);
isFalse(
  'a row the day after the range is out',
  matchesFilter(link({ plannedDate: '2026-11-01' }), filter({ plannedTo: '2026-10-31' })),
);

is('the count of what is set is what is set', activeFilterCount(filter({ domain: 'x', priceMinMinor: 1 })), 2);
is('a price floor and ceiling together are one filter', activeFilterCount(filter({ priceMinMinor: 1, priceMaxMinor: 2 })), 1);

// ---------------------------------------------------------------------------
console.log('\n--- and in what order ---');

const order = statusOrdering(statuses);
const sortBy = (key: Parameters<typeof readSort>[0] extends never ? never : string, ascending: boolean) =>
  ({ key, ascending }) as Parameters<typeof compareLinks>[2];

const bunch = [
  link({ id: 'a', domainKey: 'alpha.com', domainRating: 50, priceMinor: 5000, createdAt: '2026-10-01T10:00:00.000Z' }),
  link({ id: 'b', domainKey: 'bravo.com', domainRating: null, priceMinor: null, createdAt: '2026-10-01T11:00:00.000Z' }),
  link({ id: 'c', domainKey: 'charlie.com', domainRating: 90, priceMinor: 90000, createdAt: '2026-10-01T12:00:00.000Z' }),
];
const sorted = (key: string, ascending: boolean) =>
  [...bunch].sort((x, y) => compareLinks(x, y, sortBy(key, ascending), order)).map((row) => row.id).join(',');

/*
  The assertion the sort arrows rest on. A row with no domain rating is not
  a 0 and not a 101: it goes last whichever way the arrow points, because
  it is not a number at all. Postgres' own default would put it first on
  the descending pass, which is why `nullsFirst: false` is given explicitly
  on both sides in `planner-service`.
*/
is('descending by DR puts the highest first', sorted('domainRating', false), 'c,a,b');
is('ascending by DR puts the lowest first', sorted('domainRating', true), 'a,c,b');
is('and the blank is last both times', sorted('domainRating', false).endsWith('b') && sorted('domainRating', true).endsWith('b'), true);
is('the same for a missing price', sorted('priceMinor', false), 'c,a,b');
is('and for a name', sorted('domain', true), 'a,b,c');

/*
  Stability. Two rows the sort cannot tell apart must not swap between one
  page and the next - under paging that shows one row twice and hides
  another.
*/
const tied = [
  link({ id: 'z', domainRating: 70, createdAt: '2026-10-01T10:00:00.000Z' }),
  link({ id: 'y', domainRating: 70, createdAt: '2026-10-01T09:00:00.000Z' }),
];
is(
  'tied rows fall back to when they were added',
  [...tied].sort((x, y) => compareLinks(x, y, sortBy('domainRating', false), order)).map((r) => r.id).join(','),
  'y,z',
);
is(
  'and the tie-break does not flip with the arrow',
  [...tied].sort((x, y) => compareLinks(x, y, sortBy('domainRating', true), order)).map((r) => r.id).join(','),
  'y,z',
);

// ---------------------------------------------------------------------------
console.log('\n--- the filter survives the URL ---');

const read = (query: Record<string, string>) => readFilter((key) => query[key]);

is('a comma list of statuses comes back as a list', read({ status: 'a,b,c' }).statusIds.length, 3);
is('a price in pounds is stored in pence', read({ pmin: '12.50' }).priceMinMinor, 1250);
is('a nonsense price is nothing rather than NaN', read({ pmin: 'abc' }).priceMinMinor, null);
is('a negative price is nothing', read({ pmin: '-5' }).priceMinMinor, null);
is('a nonsense date is nothing', read({ from: 'yesterday' }).plannedFrom, null);
is('a real date is itself', read({ from: '2026-10-01' }).plannedFrom, '2026-10-01');
is('a very long search term is cut', read({ q: 'x'.repeat(500) }).domain.length, 100);
/*
  `*` is dropped rather than escaped. PostgREST turns it into `%` before
  Postgres sees it, so a term carrying one would be a wildcard against the
  database and a literal against the in-memory store - the two sides
  disagreeing, which is the one thing `filter.ts` exists to prevent.
*/
is('a star is dropped from a search term', read({ q: 'for*bes' }).domain, 'forbes');

is('the default sort is not written into the URL', Object.keys(filterParams(NO_FILTER, DEFAULT_SORT)).length, 0);
const roundTrip = filter({ domain: 'forbes', statusIds: ['s-live'], priceMinMinor: 1250 });
const params = filterParams(roundTrip, DEFAULT_SORT);
is('what goes into the URL comes back out', read(params).domain, 'forbes');
is('including the price, in pence again', read(params).priceMinMinor, 1250);
is('an unknown sort key falls back to the default', readSort(() => 'nonsense').key, DEFAULT_SORT.key);
isFalse('a number sorts descending by default', readSort((key) => (key === 'sort' ? 'dr' : undefined)).ascending);
isTrue('and a name ascending', readSort((key) => (key === 'sort' ? 'domain' : undefined)).ascending);

// ---------------------------------------------------------------------------
console.log('\n--- a spreadsheet, in and out ---');

const mapping = mapHeaders(['Website', 'Vendor', 'DA', 'Monthly Traffic', 'Due Date', 'Cost', 'CCY']);
is('"Website" is the domain column', mapping.domain, 'Website');
is('"Vendor" is the source', mapping.source, 'Vendor');
is('"DA" is read as the domain rating', mapping.domainRating, 'DA');
is('"Due Date" is the planned date', mapping.plannedDate, 'Due Date');
is('"CCY" is the currency', mapping.currency, 'CCY');

const reading = readImport(
  ['Website', 'Monthly Traffic', 'Due Date', 'Cost'],
  [
    { Website: 'https://Forbes.com/x', 'Monthly Traffic': '12.4M', 'Due Date': '03/10/2026', Cost: '1,350' },
    { Website: 'not a domain at all', 'Monthly Traffic': '', 'Due Date': '', Cost: '' },
    { Website: 'bbc.co.uk', 'Monthly Traffic': '', 'Due Date': '', Cost: '' },
  ],
);
is('the good rows are read', reading.rows.length, 2);
is('and the bad one is reported by line number', reading.problems[0]?.line, 3);
is('a URL is reduced to a domain key', reading.rows[0]?.domainKey, 'forbes.com');
is('"12.4M" is 12,400,000', reading.rows[0]?.organicTraffic, 12_400_000);
/*
  Day-first. "03/10/2026" from a UK agency is 3 October, and reading it as
  10 March moves a placement seven months and nobody notices until the
  month it was planned for is empty.
*/
is('03/10/2026 is 3 October, not 10 March', reading.rows[0]?.plannedDate, '2026-10-03');
is('a price with a thousands separator is still a price', reading.rows[0]?.priceMinor, 135000);
is('a row with no traffic has none, rather than zero', reading.rows[2 - 1]?.organicTraffic, null);

const csv = linksToCsv([link({ priceMinor: null, anchorText: '=SUM(A1:A9)' })], statuses);
/* Every field is quoted by the shared `toCsv`, headers included, so the
   comparison is against the quoted form rather than the bare names. */
is(
  'the export starts with the headers',
  csv.split('\n')[0]?.replace(/^\uFEFF/, '').replace(/[\r"]/g, ''),
  CSV_HEADERS.join(','),
);
/*
  A cell starting with `=` is a formula the moment somebody opens the file
  in Excel, and the anchor column is free text a publisher may have
  supplied. `defuseFormula` is shared with the marketplace exporter; this
  asserts the planner actually uses it.
*/
isTrue('a formula in a cell is defused before it reaches a spreadsheet', /'?=SUM/.test(csv) && !/,=SUM/.test(csv));
isFalse('and a blank price is not exported as 0', /(^|,)0(,|$)/m.test(csv.split('\n')[1] ?? ''));

console.log(
  failed === 0 ? '\nAll planner checks passed.\n' : `\n${failed} planner check(s) failed.\n`,
);
process.exit(failed === 0 ? 0 : 1);
