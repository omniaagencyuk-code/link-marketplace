/**
 * Prove the link gap finder's arithmetic before it spends anything.
 *
 * No API key, no database, no network. Everything here decides what a report
 * costs, whether it may run, and what counts as a gap - and all three are
 * things you would rather not discover were wrong from an Ahrefs invoice.
 */
import {
  COLUMNS_SELECTED,
  UNIT_FLOOR_PER_REQUEST,
  costOfPull,
  costOfRun,
  describeForAdmin,
  isFresh,
  mayRunGap,
} from '../src/lib/gap/cost';
import { checkTargets, findGap } from '../src/lib/gap/analysis';

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
    units-cost-row   = columns selected
    units-cost-total = max(50, rows x columns)
  One column selected, so one unit per referring domain.
*/
is('one column is selected', COLUMNS_SELECTED, 1);
is('2,500 rows cost 2,500', costOfPull(2500), 2500);
is('100 rows cost 100', costOfPull(100), 100);

// The floor, which makes a tiny pull cost the same as a middling one.
is('a 10-row pull still costs the floor', costOfPull(10), UNIT_FLOOR_PER_REQUEST);
is('and so does a 1-row pull', costOfPull(1), UNIT_FLOOR_PER_REQUEST);

is('four uncached targets at the cap', costOfRun(4, 2500), 10_000);
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
is('and it is costed', allowed.estimatedUnits, 10_000);

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

// 90% of 500,000 is 450,000, so a 10,000-unit run is refused at 441,000 used.
isTrue('a run that fits is allowed', mayRunGap({ ...base, unitsUsedThisCycle: 439_000 }).allowed);
const overCeiling = mayRunGap({ ...base, unitsUsedThisCycle: 441_000 });
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

console.log(failed === 0 ? '\nAll gap checks passed.\n' : `\n${failed} gap check(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
