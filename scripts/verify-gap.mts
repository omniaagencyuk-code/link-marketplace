/**
 * Prove the link gap finder's arithmetic before it spends anything.
 *
 * No API key, no database, no network. Everything here decides what a report
 * costs, whether it may run, and what counts as a gap - and all three are
 * things you would rather not discover were wrong from an Ahrefs invoice.
 */
import {
  COLUMNS_CHARGED,
  UNIT_FLOOR_PER_REQUEST,
  costOfPull,
  costOfRun,
  costOfSuggestion,
  describeForAdmin,
  isFresh,
  mayRunGap,
  maySuggestCompetitors,
} from '../src/lib/gap/cost';
import { checkTargets, compareReportRows, findGap } from '../src/lib/gap/analysis';
import {
  SUGGESTION_COLUMNS,
  SUGGESTION_ROWS,
  isPlatform,
  rankSuggestions,
} from '../src/lib/gap/competitors';

let failed = 0;
const ok = (label: string) => console.log(`  PASS  ${label}`);
const bad = (label: string, detail?: string) => {
  failed += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ''}`);
};
const is = (label: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(label) : bad(label, `expected ${String(expected)}, got ${String(actual)}`);
const isTrue = (label: string, actual: boolean) => (actual ? ok(label) : bad(label, 'expected true'));
const has = (label: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(label) : bad(label, `missing ${JSON.stringify(needle)}`);
const hasNot = (label: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? bad(label, `found ${JSON.stringify(needle)}`) : ok(label);

// ---------------------------------------------------------------------------
console.log('\n--- what a pull costs ---');

/*
  Measured against the live API, not assumed:
    units-cost-row   = the columns the request TOUCHES
    units-cost-total = max(50, rows x columns)

  "Touches", not "selects". Three calls against the free ahrefs.com target,
  identical but for the sort:

    select=domain, no order_by            -> 1 unit a row
    select=domain, order_by=domain:desc   -> 1 unit a row
    select=domain, order_by=domain_rating -> 2 units a row

  Our pull selects `domain` and sorts by `domain_rating`, so it is charged for
  two. This read as 1 for the whole of 0054, which made every estimate the
  guard produced half the real figure.
*/
is('two columns are charged for', COLUMNS_CHARGED, 2);
is('2,500 rows cost 5,000', costOfPull(2500), 5000);
is('100 rows cost 200', costOfPull(100), 200);

// The floor, which makes a tiny pull cost the same as a middling one.
is('a 10-row pull still costs the floor', costOfPull(10), UNIT_FLOOR_PER_REQUEST);
is('and so does a 1-row pull', costOfPull(1), UNIT_FLOOR_PER_REQUEST);

is('four uncached targets at the cap', costOfRun(4, 2500), 20_000);
is('nothing uncached costs nothing', costOfRun(0, 2500), 0);

/*
  The cap is the whole defence.

  Without it the bill is the competitor's backlink profile, and the customer
  picks the competitor: three competitors at fifty thousand referring domains
  each is 150,000 units from one form submission.
*/
isTrue('the cap bounds a run regardless of competitor size', costOfRun(4, 2500) < costOfRun(4, 50_000));

// ---------------------------------------------------------------------------
console.log('\n--- whether it may run ---');

const settings = {
  enabled: true,
  monthlyUnitBudget: 500_000,
  unitSafetyPct: 90,
  rowsPerTarget: 2500,
  runsPerAccount: 5,
  maxCompetitors: 3,
};

const base = {
  settings,
  configured: true,
  unitsUsedThisCycle: 0,
  runsThisCycle: 0,
  uncachedTargets: 4,
};

const allowed = mayRunGap(base);
isTrue('a funded first run is allowed', allowed.allowed);
is('and it is costed', allowed.estimatedUnits, 20_000);

isTrue('switched off refuses', !mayRunGap({ ...base, settings: { ...settings, enabled: false } }).allowed);
isTrue('unconfigured refuses', !mayRunGap({ ...base, configured: false }).allowed);

/*
  The per-account limit is checked before the budget, and that ordering is the
  design.

  A customer who has used their five should be told that - they can wait for
  the month to turn. A customer refused because our allowance is spent has
  nothing they can do. Conflating the two makes the first sound like the
  second.
*/
const usedUp = mayRunGap({ ...base, runsThisCycle: 5 });
isTrue('a customer past their run limit is refused', !usedUp.allowed);
has('and told how many they have used', usedUp.allowed ? '' : usedUp.reason, '5 of your 5 reports');
has('and when more arrive', usedUp.allowed ? '' : usedUp.reason, 'when the month turns');

const bothSpent = mayRunGap({ ...base, runsThisCycle: 5, unitsUsedThisCycle: 490_000 });
has(
  'the run limit is named even when the budget is also gone',
  bothSpent.allowed ? '' : bothSpent.reason,
  'reports this month',
);

// 90% of 500,000 is 450,000, so a 20,000-unit run is refused at 431,000 used.
isTrue('a run that fits is allowed', mayRunGap({ ...base, unitsUsedThisCycle: 429_000 }).allowed);
const overCeiling = mayRunGap({ ...base, unitsUsedThisCycle: 431_000 });
isTrue('a run that does not fit is refused', !overCeiling.allowed);
is('and the ceiling is the safety share, not the budget', overCeiling.ceiling, 450_000);
isTrue('so it stops below the full budget', !mayRunGap({ ...base, unitsUsedThisCycle: 455_000 }).allowed);

/*
  What a customer is told when our budget is the reason.

  They learn it is unavailable and when to come back. They do not learn our
  allowance, our spend, or our cost base - none of which is their business and
  none of which they can act on.
*/
const budgetGone = mayRunGap({ ...base, unitsUsedThisCycle: 460_000 });
const customerReason = budgetGone.allowed ? '' : budgetGone.reason;
has('a budget refusal says to come back', customerReason, 'try again later');
hasNot('and never quotes our allowance', customerReason, '450,000');
hasNot('nor our spend', customerReason, '460,000');
hasNot('nor mentions units at all', customerReason.toLowerCase(), 'unit');
hasNot('nor names Ahrefs', customerReason.toLowerCase(), 'ahrefs');

// The admin view is entitled to the numbers the customer is not.
has('the admin view quotes the spend', describeForAdmin(budgetGone), 'remaining');
has('and the ceiling', describeForAdmin(allowed), '450,000');

// A caching hit makes a run cheaper, and can make a refused one allowed.
isTrue(
  'a fully cached run costs nothing and is allowed',
  mayRunGap({ ...base, uncachedTargets: 0, unitsUsedThisCycle: 449_000 }).allowed,
);

console.log('\n--- is a cached pull still usable ---');
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();
isTrue('a pull from yesterday is fresh at 30 days', isFresh(daysAgo(1), 30, now));
isTrue('one from 29 days ago still is', isFresh(daysAgo(29), 30, now));
isTrue('one from 31 days ago is not', !isFresh(daysAgo(31), 30, now));
isTrue('a nonsense date is never fresh', !isFresh('not a date', 30, now));

// ---------------------------------------------------------------------------
console.log('\n--- what counts as a gap ---');

const gap = findGap({
  target: 'mine.com',
  competitors: ['rival-a.com', 'rival-b.com'],
  refdomainsByCompetitor: new Map([
    ['rival-a.com', ['both.com', 'only-a.com', 'already-mine.com', 'rival-b.com', 'mine.com']],
    ['rival-b.com', ['both.com', 'only-b.com', 'already-mine.com']],
  ]),
  targetRefdomains: ['already-mine.com'],
});

const domains = gap.map((row) => row.domain);
is('three gaps found', gap.length, 3);

/*
  Ordered by how many competitors link to it.

  A domain linking to both rivals covers the niche; one linking to a single
  rival happened to mention somebody. That ordering is the only ranking
  available without buying metrics for domains we may not be able to sell.
*/
is('the domain linking to both comes first', domains[0], 'both.com');
is('and it carries its evidence', gap[0]?.linkingCompetitors.length, 2);

isTrue('a domain already linking to them is not a gap', !domains.includes('already-mine.com'));

/*
  Two exclusions that have bitten link-gap tools before.

  Competitors link to each other constantly, and "get a link from your direct
  rival" is not advice. And the customer's own domain appearing in a rival's
  backlinks is common and is not a gap either.
*/
isTrue('a competitor is never a gap', !domains.includes('rival-b.com'));
isTrue("and nor is the customer's own domain", !domains.includes('mine.com'));

// www and protocols are normalised on the way in, so one site is one row.
const normalised = findGap({
  target: 'mine.com',
  competitors: ['rival.com'],
  refdomainsByCompetitor: new Map([
    ['rival.com', ['https://www.Example.com/some/page', 'example.com', 'EXAMPLE.com']],
  ]),
  targetRefdomains: [],
});
is('three spellings of one site are one gap', normalised.length, 1);
is('and it is the clean form', normalised[0]?.domain, 'example.com');

is(
  'a competitor with no referring domains yet is handled',
  findGap({
    target: 'mine.com',
    competitors: ['rival.com'],
    refdomainsByCompetitor: new Map(),
    targetRefdomains: [],
  }).length,
  0,
);

console.log('\n--- checking what they typed, before it costs anything ---');

const checked = checkTargets('https://www.Mine.com/about', ['rival-a.com', 'RIVAL-B.com'], 3);
isTrue('a valid form passes', checked.ok);
if (checked.ok) {
  is('the target is normalised', checked.targets.target, 'mine.com');
  is('and the competitors are too', checked.targets.competitors.join(','), 'rival-a.com,rival-b.com');
}

isTrue('no target is refused', !checkTargets('', ['a.com'], 3).ok);
isTrue('no competitor is refused', !checkTargets('mine.com', [], 3).ok);
isTrue('a blank competitor box is not a competitor', !checkTargets('mine.com', ['', '  '], 3).ok);

const tooMany = checkTargets('mine.com', ['a.com', 'b.com', 'c.com', 'd.com'], 3);
isTrue('more than the maximum is refused', !tooMany.ok);
if (!tooMany.ok) has('and says how many', tooMany.error, 'more than 3 competitors');

/*
  Dropped rather than refused.

  Typing your own site into a competitor box is an ordinary mistake, and
  failing the whole form over it is worse than ignoring it. What it must not
  do is cost a pull for a gap that is empty by definition.
*/
const ownDomain = checkTargets('mine.com', ['mine.com', 'rival.com'], 3);
isTrue('your own domain among the competitors is dropped', ownDomain.ok);
if (ownDomain.ok) {
  is('leaving only the real competitor', ownDomain.targets.competitors.join(','), 'rival.com');
}

const duplicated = checkTargets('mine.com', ['rival.com', 'https://www.rival.com/'], 3);
isTrue('the same competitor twice is one competitor', duplicated.ok);
if (duplicated.ok) is('so only one pull is paid for', duplicated.targets.competitors.length, 1);

/*
  `normaliseDomain` alone was not enough, and the verifier is how I found out.

  It lowercases and strips a protocol, a www and a path; it does not judge
  what is left, so "not a domain at all" came through intact - and a pull for
  that is fifty units for an empty answer. The importer always pairs it with
  `isValidDomain`, and so does this now.
*/
for (const junk of ['not a domain at all', 'hello', '...', 'a b c', '@@@']) {
  const refused = checkTargets('mine.com', [junk], 3);
  if (refused.ok) bad(`junk is refused: ${JSON.stringify(junk)}`);
}
ok('junk in a competitor box is refused rather than pulled');

isTrue('and junk as the target is too', !checkTargets('not a domain', ['rival.com'], 3).ok);
isTrue('a real domain still passes', checkTargets('mine.co.uk', ['rival.com'], 3).ok);

// ---------------------------------------------------------------------------
console.log('\n--- suggesting competitors, and what that costs ---');

/*
  Measured against the live API with exactly the select `organicCompetitors`
  sends, on the free `ahrefs.com` target:

    rows 8, units-cost-row 3, units-cost-total 50

  Twelve rows at three columns is thirty-six, under the fifty-unit floor. So a
  suggestion is the floor and nothing more - fiftieth of what one
  referring-domain pull costs, which is the whole argument for suggesting
  rather than guessing.
*/
is('three columns, all unsurcharged', SUGGESTION_COLUMNS, 3);
is('a suggestion costs the floor', costOfSuggestion(SUGGESTION_ROWS, SUGGESTION_COLUMNS), 50);
isTrue(
  'which is a rounding error against one pull',
  costOfSuggestion(SUGGESTION_ROWS, SUGGESTION_COLUMNS) * 50 <= costOfPull(2500),
);

/*
  The arithmetic, not the constant fifty.

  Written that way so adding a surcharged column, or asking for hundreds of
  rows, changes the number here rather than silently invalidating the comment
  above. These two cases are what would catch that.
*/
is('hundreds of rows would cost more than the floor', costOfSuggestion(500, 3), 1500);
is('and so would a surcharged column', costOfSuggestion(12, 10), 120);

const suggestSettings = {
  enabled: true,
  monthlyUnitBudget: 500_000,
  unitSafetyPct: 90,
  runsPerAccount: 5,
};

const suggestBase = {
  settings: suggestSettings,
  configured: true,
  unitsUsedThisCycle: 0,
  runsThisCycle: 0,
  rows: SUGGESTION_ROWS,
  columns: SUGGESTION_COLUMNS,
};

isTrue('a funded suggestion is allowed', maySuggestCompetitors(suggestBase).allowed);
isTrue(
  'switched off refuses a suggestion too',
  !maySuggestCompetitors({ ...suggestBase, settings: { ...suggestSettings, enabled: false } }).allowed,
);
isTrue('unconfigured refuses it', !maySuggestCompetitors({ ...suggestBase, configured: false }).allowed);

/*
  A suggestion is fifty units, a report is 10,000, and the two guards are
  separate so neither distorts the other.

  At 445,000 used the ceiling is 450,000, so there is room for a suggestion and
  not for a report. Tying them together would refuse the fifty-unit lookup
  because the expensive thing would not fit.
*/
isTrue(
  'a suggestion fits where a report does not',
  maySuggestCompetitors({ ...suggestBase, unitsUsedThisCycle: 445_000 }).allowed &&
    !mayRunGap({ ...base, unitsUsedThisCycle: 445_000 }).allowed,
);

/*
  The one thing it borrows from the report guard.

  An account with no reports left cannot run anything, so there is nothing for a
  suggestion to be for - and without this the button would be the cheapest way
  for one customer to spend our units. Not an allowance: a suggestion never
  costs anybody a report.
*/
const noReportsLeft = maySuggestCompetitors({ ...suggestBase, runsThisCycle: 5 });
isTrue('an account out of reports cannot suggest either', !noReportsLeft.allowed);
has(
  'and is told to add them by hand',
  noReportsLeft.allowed ? '' : noReportsLeft.reason,
  'by hand',
);

// The same discretion as the report refusal: no allowance, no spend, no Ahrefs.
const suggestBudgetGone = maySuggestCompetitors({ ...suggestBase, unitsUsedThisCycle: 460_000 });
const suggestReason = suggestBudgetGone.allowed ? '' : suggestBudgetGone.reason;
isTrue('a spent budget refuses a suggestion', !suggestBudgetGone.allowed);
hasNot('without quoting our allowance', suggestReason, '450,000');
hasNot('nor mentioning units', suggestReason.toLowerCase(), 'unit');
hasNot('nor naming Ahrefs', suggestReason.toLowerCase(), 'ahrefs');

console.log('\n--- which suggestions are worth offering ---');

/*
  The endpoint ranks by shared keywords, and the sites sharing the most keywords
  with anything are the platforms that rank for everything. Measured against
  `ahrefs.com`, `google.com` came back fifth with 816 shared keywords. Offering
  it would be 2,500 units to learn that Google's referring domains are other
  giants - none of which we sell and none of which anybody can pitch.
*/
for (const platform of [
  'google.com',
  'google.co.uk',
  'news.google.com',
  'youtube.com',
  'en.wikipedia.org',
  'amazon.co.uk',
  'reddit.com',
  'x.com',
]) {
  if (!isPlatform(platform)) bad(`a platform is never suggested: ${platform}`);
}
ok('platforms are never suggested, under any subdomain or market');

// And the filter is narrow: a name that merely contains a platform's is not one.
for (const real of ['googleads-agency.com', 'amazonaws-tips.co.uk', 'mysite.com', 'seo-reddit.com']) {
  if (isPlatform(real)) bad(`a real site is not a platform: ${real}`);
}
ok('a site that merely sounds like one is left alone');

const ranked = rankSuggestions(
  [
    { domain: 'google.com', keywordsCommon: 9999, domainRating: 100 },
    { domain: 'close-rival.com', keywordsCommon: 1400, domainRating: 55 },
    { domain: 'https://www.Strongest.com/page', keywordsCommon: 2400, domainRating: 61 },
    { domain: 'mine.com', keywordsCommon: 5000, domainRating: 40 },
    { domain: 'shop.mine.com', keywordsCommon: 4000, domainRating: 38 },
    { domain: 'close-rival.com', keywordsCommon: 1400, domainRating: 55 },
    { domain: 'not a domain', keywordsCommon: 900, domainRating: 10 },
    { domain: 'distant.com', keywordsCommon: 120, domainRating: 90 },
  ],
  { target: 'mine.com', limit: 6 },
);
const suggested = ranked.map((row) => row.domain);

isTrue('the platform is dropped however many keywords it shares', !suggested.includes('google.com'));
isTrue("the customer's own domain is not its own rival", !suggested.includes('mine.com'));

/*
  Subdomains of the target, not only the target.

  `mode=subdomains` means a site with a shop or a blog on a subdomain comes back
  as its own competitor, and a pull for that is 2,500 units for a gap that is
  empty by definition.
*/
isTrue('and nor is a subdomain of it', !suggested.includes('shop.mine.com'));

isTrue('junk never reaches a 5,000-unit pull', !suggested.some((entry) => entry.includes(' ')));
is('the same rival twice is one suggestion', suggested.filter((e) => e === 'close-rival.com').length, 1);
is('spellings are normalised', suggested.includes('strongest.com'), true);

/*
  Ordered by shared keywords, not by domain rating.

  A site competing for the same searches has the links that would help. A
  stronger site with nothing in common does not, and ranking by domain rating
  would put it first - which is how a gap report ends up being about somebody
  else's market.
*/
is('the closest rival comes first', suggested[0], 'strongest.com');
is('and the strong stranger comes last', suggested[suggested.length - 1], 'distant.com');

is('the limit is respected', rankSuggestions(ranked, { target: 'mine.com', limit: 2 }).length, 2);
is('nothing in, nothing out', rankSuggestions([], { target: 'mine.com', limit: 6 }).length, 0);

/*
  Re-ranking a cached row has to be stable, because that is what the service
  does on the way out: the platform list and the ordering are code, and a row
  cached a fortnight ago under an older filter would otherwise keep suggesting
  whatever that filter let through.
*/
is(
  're-ranking what was already ranked changes nothing',
  rankSuggestions(ranked, { target: 'mine.com', limit: 6 }).map((row) => row.domain).join(','),
  suggested.join(','),
);

// ---------------------------------------------------------------------------
console.log('\n--- the order a report is read in ---');

/*
  Taken from the first real report run through the live feature:
  pressparrot.com against fatjoe.com, collaborator.pro and adsy.com. These are
  its actual rows, and they are what showed the bug - inside the "you can buy
  these from us" table every row linking to one competitor was alphabetical, so
  a DR 48 site with one visitor a month sat above a DR 80 site with 646,000.
*/
const rows = [
  { domain: 'anniversaryjourney.com', linkingCompetitors: ['collaborator.pro'], websiteId: 'w1', domainRating: 48, organicTraffic: 1 },
  { domain: 'hostadvice.com', linkingCompetitors: ['adsy.com'], websiteId: 'w2', domainRating: 80, organicTraffic: 646_449 },
  { domain: 'serpwatch.io', linkingCompetitors: ['adsy.com', 'collaborator.pro', 'fatjoe.com'], websiteId: 'w3', domainRating: 73, organicTraffic: 14_144 },
  { domain: 'allhiphop.com', linkingCompetitors: ['collaborator.pro'], websiteId: 'w4', domainRating: 73, organicTraffic: 46_245 },
  { domain: 'analyticsinsight.net', linkingCompetitors: ['adsy.com', 'fatjoe.com'], websiteId: 'w5', domainRating: 80, organicTraffic: 981_148 },
  // Not ours, so no metrics were ever bought for it - and it outranks none of
  // the above however strong it might really be.
  { domain: 'aaa-not-ours.com', linkingCompetitors: ['adsy.com', 'collaborator.pro', 'fatjoe.com'] },
];

const ordered = [...rows].sort(compareReportRows).map((row) => row.domain);

is('everything we can sell comes first', ordered.indexOf('aaa-not-ours.com'), rows.length - 1);
is('then the site covering the whole niche', ordered[0], 'serpwatch.io');
is('then the two-rival row', ordered[1], 'analyticsinsight.net');

/*
  The fix. Within one evidence tier the strongest comes first, where it used to
  be whichever name sorted earliest.
*/
is('the strongest single-rival row beats the weakest', ordered[2], 'hostadvice.com');
is('and traffic breaks a tie on rating', ordered[3], 'allhiphop.com');
is('the DR 48 one-visitor site comes last of ours', ordered[4], 'anniversaryjourney.com');

isTrue(
  'relevance still outranks strength: three rivals at DR 73 beats one at DR 80',
  ordered.indexOf('serpwatch.io') < ordered.indexOf('hostadvice.com'),
);

// A row with no metrics must not be read as a rating of zero *among ours* - it
// is simply not ours, which key one already decided.
const noMetrics = [
  { domain: 'b.com', linkingCompetitors: ['x.com'] },
  { domain: 'a.com', linkingCompetitors: ['x.com'] },
];
is(
  'rows with no metrics fall through to the name',
  [...noMetrics].sort(compareReportRows).map((row) => row.domain).join(','),
  'a.com,b.com',
);

// Stable: sorting an ordered list again changes nothing.
is(
  'the order is stable',
  [...rows].sort(compareReportRows).sort(compareReportRows).map((row) => row.domain).join(','),
  ordered.join(','),
);

console.log(failed === 0 ? '\nAll gap checks passed.\n' : `\n${failed} gap check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
