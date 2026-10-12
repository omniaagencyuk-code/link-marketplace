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
import { summariseMonth, type PlannerGroup } from '../src/lib/planner/summary';
import { buildReport } from '../src/lib/planner/reports';
import { CSV_HEADERS, linksToCsv, mapHeaders, readImport } from '../src/lib/planner/csv';
import type {
  PaymentStatus,
  PlannerLink,
  PlannerStatus,
  StatusCategory,
} from '../src/lib/types/planner';

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

const CATEGORY_OF: Record<string, StatusCategory> = {
  's-plan': 'planned',
  's-live': 'live',
  's-lost': 'lost',
};

interface FixtureLink {
  statusId: string;
  month?: string;
  source?: string;
  linkType?: string;
  anchorType?: string;
  priceMinor?: number | null;
  currency?: string | null;
  paymentStatus?: PaymentStatus;
  paidMinor?: number | null;
}

/**
 * Fixture links, as the five dimensions of groups the database returns.
 *
 * `merge` is the thing worth having two of. With it false every link is
 * its own group, which is what `summariseMonth` would see if nothing were
 * ever grouped; with it true identical links are merged exactly as
 * Postgres' `group by` merges them. Both are run through the same
 * assertions below, because the whole refactor rests on the two agreeing -
 * and `greatest(0, price - paid)` clamped per row rather than after the
 * sum is the one place they could not.
 */
function groupsOf(links: FixtureLink[], merge = true): PlannerGroup[] {
  const out = new Map<string, PlannerGroup>();
  links.forEach((link, index) => {
    const category = CATEGORY_OF[link.statusId] ?? 'planned';
    const price = link.priceMinor === undefined ? 10000 : (link.priceMinor ?? 0);
    const payment = link.paymentStatus ?? 'unpaid';
    const paid =
      payment === 'paid' ? price : payment === 'partially_paid' ? (link.paidMinor ?? 0) : 0;
    const currency = link.currency === undefined ? 'GBP' : link.currency;

    const buckets: [PlannerGroup['dimension'], string][] = [
      ['month', link.month ?? '2026-10-01'],
      ['source', link.source ?? 'Outreach'],
      ['linkType', link.linkType ?? 'Guest Post'],
      ['anchorType', link.anchorType ?? 'Branded'],
      ['status', link.statusId],
    ];

    for (const [dimension, bucket] of buckets) {
      const key = merge
        ? [dimension, bucket, category, payment, currency ?? ''].join('|')
        : `${index}|${dimension}`;
      const group = out.get(key) ?? {
        dimension,
        bucket,
        category,
        paymentStatus: payment,
        currency,
        count: 0,
        priceSum: 0,
        paidSum: 0,
        owingSum: 0,
      };
      group.count += 1;
      group.priceSum += price;
      group.paidSum += paid;
      group.owingSum += Math.max(0, price - paid);
      out.set(key, group);
    }
  });
  return [...out.values()];
}

/*
  The assertion the whole budget card rests on. A row with no price is not
  a row that cost nothing, and a month of unpriced rows must not report a
  spend of zero and a budget untouched - it must report that it does not
  know.
*/
const blanks = summariseMonth(groupsOf([{ statusId: 's-plan', priceMinor: null }, { statusId: 's-plan', priceMinor: null }]), {
  target: null,
  budgetMinor: 100000,
  currency: 'GBP',
});
is('two unpriced rows commit nothing', blanks.committedMinor, 0);
is('and nothing has been paid', blanks.paidMinor, 0);
is('no target means no progress figure, rather than 0%', blanks.progress, null);

const monthLinks: FixtureLink[] = [
  { statusId: 's-live', paymentStatus: 'paid' },
  { statusId: 's-live', paymentStatus: 'partially_paid', paidMinor: 4000 },
  { statusId: 's-lost', priceMinor: 50000 },
  { statusId: 's-plan', priceMinor: 20000 },
];
const month = summariseMonth(groupsOf(monthLinks), {
  target: 4,
  budgetMinor: 100000,
  currency: 'GBP',
});
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
is('and the total is every link once, not once per dimension', month.total, 4);

/*
  Grouping must not change any of that. The database merges identical rows
  before this ever sees them, and if the arithmetic were sensitive to that
  merge the figures would depend on how varied somebody's plan happened to
  be.
*/
const ungrouped = summariseMonth(groupsOf(monthLinks, false), {
  target: 4,
  budgetMinor: 100000,
  currency: 'GBP',
});
is('merging identical rows changes no figure (paid)', ungrouped.paidMinor, month.paidMinor);
is('nor committed', ungrouped.committedMinor, month.committedMinor);
is('nor the total', ungrouped.total, month.total);

/*
  And the per-row clamp is the reason that holds. One row overpaid by
  5,000 and one underpaid by 5,000 owe 5,000 between them, not nothing:
  clamping after the sum would net them off and report the second as
  settled.
*/
const lopsided: FixtureLink[] = [
  { statusId: 's-plan', priceMinor: 10000, paymentStatus: 'partially_paid', paidMinor: 15000 },
  { statusId: 's-plan', priceMinor: 10000, paymentStatus: 'partially_paid', paidMinor: 5000 },
];
is(
  'an overpaid row does not pay off another row',
  summariseMonth(groupsOf(lopsided), { target: null, budgetMinor: null, currency: 'GBP' })
    .committedMinor,
  5000,
);

/*
  A euro row is counted apart and named, never converted. There is no
  exchange-rate source in this application, and a rate fetched today
  applied to an invoice paid in March is a figure that looks precise and
  is not.
*/
const mixed = summariseMonth(
  groupsOf([{ statusId: 's-plan' }, { statusId: 's-plan', currency: 'EUR', priceMinor: 90000 }]),
  { target: null, budgetMinor: 100000, currency: 'GBP' },
);
is('a row in another currency is not added to the total', mixed.committedMinor, 10000);
is('it is counted apart', mixed.otherCurrencies[0]?.count, 1);
is('and named', mixed.otherCurrencies[0]?.currency, 'EUR');

// ---------------------------------------------------------------------------
console.log('\n--- the reports ---');

const reportLinks: FixtureLink[] = [
  { statusId: 's-live', month: '2026-08-01', source: 'Press Parrot', paymentStatus: 'paid', priceMinor: 30000 },
  { statusId: 's-plan', month: '2026-10-01', source: 'Outreach', priceMinor: 20000 },
  { statusId: 's-live', month: '2026-10-01', source: 'Outreach', paymentStatus: 'paid', priceMinor: 15000, linkType: 'Link Insertion', anchorType: 'Exact Match' },
  { statusId: 's-lost', month: '2026-10-01', source: 'Direct Publisher', priceMinor: 90000 },
];
const report = buildReport(groupsOf(reportLinks), statuses, 'GBP');

is('the report counts every link once', report.total, 4);
/*
  September has nothing in it and sits between two months that do. It is a
  real zero and the report says so - a table that skips it draws a
  straight line over a gap somebody would read as "we kept going".
*/
is('a month with nothing in it is still a month', report.months.length, 3);
is('and it is the empty one in the middle', report.months[1]?.planned, 0);
is('August planned one', report.months[0]?.planned, 1);
is('and it is live', report.months[0]?.live, 1);
is('October planned three', report.months[2]?.planned, 1 + 1 + 1);
is('of which one is live', report.months[2]?.live, 1);
is('October paid is the paid row only', report.months[2]?.paidMinor, 15000);
/*
  The lost row's 90,000 is not committed. A placement that fell through is
  not money we owe, and a report that says it is turns a lost link into a
  bill.
*/
is('and committed excludes the lost row', report.months[2]?.committedMinor, 20000);

const bySource = new Map(report.sources.map((row) => [row.source, row]));
is('spend by source keeps the sources apart', report.sources.length, 3);
is('Press Parrot paid 30,000', bySource.get('Press Parrot')?.paidMinor, 30000);
is('Direct Publisher paid nothing', bySource.get('Direct Publisher')?.paidMinor, 0);
is('and the lost link commits nothing against them', bySource.get('Direct Publisher')?.committedMinor, 0);

is('the status breakdown is in the customer’s own order', report.statuses.map((row) => row.name).join(','), 'Planned,Live,Lost');
is('and shares are of the whole plan', report.statuses.find((row) => row.name === 'Live')?.share, 50);
is('link types are counted', report.linkTypes.find((slice) => slice.label === 'Guest Post')?.count, 3);
is('and so are anchor types', report.anchorTypes.find((slice) => slice.label === 'Branded')?.count, 3);

isTrue('an empty project reports itself as empty', buildReport([], statuses, 'GBP').empty);
is('and has no months to draw', buildReport([], statuses, 'GBP').months.length, 0);

/*
  A status somebody retired after filing links under it still names them.
  Dropping it would leave rows counted under nothing, and the breakdown
  would stop adding up to the total printed above it.
*/
const orphaned = buildReport(groupsOf([{ statusId: 's-gone' }]), statuses, 'GBP');
is('a link under a status that no longer exists is still counted', orphaned.total, 1);
is('and it is named rather than dropped', orphaned.statuses[0]?.name, 'Removed status');

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
