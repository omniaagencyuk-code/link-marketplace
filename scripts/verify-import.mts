/**
 * Does the importer actually carry accepted niches and cost prices through?
 *
 * Runs real CSV headers and rows through the same auto-mapper, parser and
 * patch builder the admin uses, and checks what comes out the far end. The
 * headers are written the way publisher spreadsheets actually write them,
 * because that is the case that matters - a column called exactly
 * "guest_post_cost" was never the hard part.
 */
import { autoMapColumns } from '../src/lib/import/auto-map';
import { prepareRows } from '../src/lib/import/prepare';
import { toWebsitePatch } from '../src/lib/import/to-website';
import { matchAcceptedNiches } from '../src/lib/config/accepted-niches';
import { findCollisions, findUnnormalised } from '../src/lib/import/duplicates';
import { toRun } from '../src/lib/services/supabase/import-history-repository';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

// ---------------------------------------------------------------- mapping
const headers = [
  'Domain', 'Guest Post Price', 'Niche Edit Price', 'Publisher Cost',
  'Niche Edit Cost', 'Niches Accepted', 'Status',
];
const mappings = autoMapColumns(headers);
const mapped = Object.fromEntries(mappings.map((m) => [m.header, m.field]));

check('"Publisher Cost" maps to guest post cost', mapped['Publisher Cost'], 'guest_post_cost');
check('"Niche Edit Cost" maps to niche edit cost', mapped['Niche Edit Cost'], 'niche_edit_cost');
check('"Niches Accepted" maps to accepted niches', mapped['Niches Accepted'], 'accepted_niches');
check('sell prices still map', mapped['Guest Post Price'], 'guest_post_price');

// a bare "Cost" is now left for the admin to decide
check('a bare "Cost" column is not auto-mapped', autoMapColumns(['Domain', 'Cost'])[1]?.field, null);

// ------------------------------------------------------------ niche matching
check('free text matches the shared list',
  matchAcceptedNiches(['iGaming', 'CBD & hemp', 'Fintech']),
  ['gambling', 'cbd', 'finance']);
check('exact slugs round-trip', matchAcceptedNiches(['gambling', 'crypto']), ['gambling', 'crypto']);
check('unknown entries are dropped, not guessed',
  matchAcceptedNiches(['Underwater Basket Weaving']), []);
check('entries match independently, not as one blob',
  matchAcceptedNiches(['Casino', 'Travel']), ['gambling', 'travel']);

// ------------------------------------------------------------- full row
const rows = [{
  Domain: 'costtest.com',
  'Guest Post Price': '300',
  'Niche Edit Price': '200',
  'Publisher Cost': '120',
  'Niche Edit Cost': '80',
  'Niches Accepted': 'Gambling|CBD|Finance',
  Status: 'active',
}];

const prepared = prepareRows(rows, mappings, { currency: 'GBP', existingDomains: new Map() });
const row = prepared[0]!;
check('row has no errors', row.issues.filter((i) => i.severity === 'error'), []);

const patch = toWebsitePatch(row.values, row.supplied);
const gp = patch.services?.find((s) => s.type === 'guest-post');
const ne = patch.services?.find((s) => s.type === 'niche-edit');

check('guest post sell price', gp?.priceMinor, 30000);
check('guest post cost price', gp?.costPriceMinor, 12000);
check('niche edit cost price', ne?.costPriceMinor, 8000);
check('accepted niches land on the rules', patch.rules?.acceptedNiches, ['gambling', 'cbd', 'finance']);
check('legacy gambling flag derived', patch.rules?.acceptsGambling, true);
check('legacy cbd flag derived', patch.rules?.acceptsCbd, true);
check('legacy adult flag stays false', patch.rules?.acceptsAdult, false);

// ------------------------------------------------- cost above price warning
const odd = prepareRows(
  [{ Domain: 'oddprice.com', 'Guest Post Price': '100', 'Publisher Cost': '250' }],
  autoMapColumns(['Domain', 'Guest Post Price', 'Publisher Cost']),
  { currency: 'GBP', existingDomains: new Map() },
)[0]!;
check('cost above price warns',
  odd.issues.some((i) => i.severity === 'warning' && /above its price/.test(i.message)), true);
check('cost above price does not block the row',
  odd.issues.some((i) => i.severity === 'error'), false);

// ------------------------------------------- a price-only update keeps the cost
const existing = {
  id: 'w1',
  services: [{ id: 's1', websiteId: 'w1', type: 'guest-post' as const, priceMinor: 30000,
    turnaroundMinDays: 3, turnaroundMaxDays: 5, available: true, costPriceMinor: 12000 }],
  rules: { minWordCount: 800, maxWordCount: 1600 },
} as never;

const priceOnly = prepareRows(
  [{ Domain: 'costtest.com', 'Guest Post Price': '350' }],
  autoMapColumns(['Domain', 'Guest Post Price']),
  { currency: 'GBP', existingDomains: new Map() },
)[0]!;
const updated = toWebsitePatch(priceOnly.values, priceOnly.supplied, existing);
check('a price-only update keeps the recorded cost',
  updated.services?.find((s) => s.type === 'guest-post')?.costPriceMinor, 12000);
check('a price-only update still changes the price',
  updated.services?.find((s) => s.type === 'guest-post')?.priceMinor, 35000);

// ----------------------------------------------------- prices by niche
const nicheHeaders = ['Domain', 'Guest Post Price', 'Gambling Price', 'crypto price', 'CBD Price'];
const nicheMappings = autoMapColumns(nicheHeaders);
check('a niche price column is auto-mapped',
  nicheMappings.find((m) => m.header === 'Gambling Price')?.field, 'niche_price_gambling');
check('a niche price column matches by slug too',
  nicheMappings.find((m) => m.header === 'crypto price')?.field, 'niche_price_crypto');

const nicheRow = prepareRows(
  [{
    Domain: 'premiums.com',
    'Guest Post Price': '300',
    'Gambling Price': '900',
    'crypto price': '£450',
    'CBD Price': '',
  }],
  nicheMappings,
  { currency: 'GBP', existingDomains: new Map() },
)[0]!;

check('niche price row has no errors', nicheRow.issues.filter((i) => i.severity === 'error'), []);

const nichePatch = toWebsitePatch(nicheRow.values, nicheRow.supplied);
const byNiche = new Map((nichePatch.nichePrices ?? []).map((p) => [p.niche, p]));

check('gambling override is stored in minor units', byNiche.get('gambling')?.priceMinor, 90000);
check('a currency symbol is parsed off', byNiche.get('crypto')?.priceMinor, 45000);
check('an empty niche column is not a price', byNiche.has('cbd'), false);
check('the override attaches to the placement on sale',
  byNiche.get('gambling')?.linkType, 'guest-post');
check('the standard price is untouched',
  nichePatch.services?.find((s) => s.type === 'guest-post')?.priceMinor, 30000);

// A site that only sells niche edits: the premium belongs to what it sells.
const editOnly = prepareRows(
  [{ Domain: 'editsonly.com', 'Niche Edit Price': '150', 'Gambling Price': '400' }],
  autoMapColumns(['Domain', 'Niche Edit Price', 'Gambling Price']),
  { currency: 'GBP', existingDomains: new Map() },
)[0]!;
const editPatch = toWebsitePatch(editOnly.values, editOnly.supplied);
check('a niche-edit-only site prices the niche edit',
  editPatch.nichePrices?.[0]?.linkType, 'niche-edit');

// A file with no niche columns must not clear the overrides already stored.
const noNiches = prepareRows(
  [{ Domain: 'premiums.com', 'Guest Post Price': '320' }],
  autoMapColumns(['Domain', 'Guest Post Price']),
  { currency: 'GBP', existingDomains: new Map() },
)[0]!;
check('a file without niche columns leaves overrides alone',
  toWebsitePatch(noNiches.values, noNiches.supplied).nichePrices, undefined);

// --------------------------------------------- two listings for one site
/*
  The importer decides create-or-update by looking a domain up in an index of
  what we already have. That index was capped at its first thousand rows, so
  every domain past the thousandth looked new. `websites.domain` is unique,
  so the insert that followed was rejected rather than accepted twice - but
  that is the constraint saving us, not the code being right, and the
  constraint compares text where the importer compares normalised text.

  These two functions are what the duplicate report knows. It reads a live
  database and cannot be run without one; this is where its judgement is
  checked.
*/
const listing = (id: string, domain: string) => ({ id, domain });

check('a clean marketplace has no collisions',
  findCollisions([listing('1', 'a.com'), listing('2', 'b.com')]), []);

// The case the unique constraint cannot catch: two spellings, one site.
check('www and bare are one site listed twice',
  findCollisions([listing('1', 'example.com'), listing('2', 'www.example.com')])
    .map((hit) => ({ domain: hit.domain, ids: hit.rows.map((row) => row.id) })),
  [{ domain: 'example.com', ids: ['1', '2'] }]);

check('three spellings are one collision, not three',
  findCollisions([
    listing('1', 'example.com'),
    listing('2', 'www.example.com'),
    listing('3', 'EXAMPLE.com'),
  ]).length, 1);

// A near-miss must not be reported as the same site. Somebody would delete a
// real listing on the strength of this.
check('a different subdomain is a different site',
  findCollisions([listing('1', 'example.com'), listing('2', 'shop.example.com')]), []);
check('and a lookalike domain is not a collision',
  findCollisions([listing('1', 'example.com'), listing('2', 'example.co')]), []);

// Two rows nothing can be made of are two problems, not one collision.
check('unparseable domains are not grouped together',
  findCollisions([listing('1', ''), listing('2', '   ')]), []);

check('collisions come out in a stable order',
  findCollisions([
    listing('1', 'zebra.com'), listing('2', 'www.zebra.com'),
    listing('3', 'apple.com'), listing('4', 'www.apple.com'),
  ]).map((hit) => hit.domain), ['apple.com', 'zebra.com']);

// Not damage - the shape damage arrives in. A row stored like this is
// invisible to the next import of its normalised spelling.
check('a row stored with www would not match a future import',
  findUnnormalised([listing('1', 'www.example.com')]).map((row) => row.id), ['1']);
check('a normalised row is not reported',
  findUnnormalised([listing('1', 'example.com')]), []);
check('nor is one that cannot be parsed at all',
  findUnnormalised([listing('1', '')]), []);

// ------------------------------------------------------- the import history
/*
  `import_runs` was created in migration 0006 and then never written to: the
  service kept its runs in a module-level array, which lives in one server
  process and is emptied by every deploy. The panel showed nothing nearly
  always, which reads as "no imports yet" rather than "this cannot remember" -
  and when the history was wanted as evidence there was none.

  Now it writes to the table, the mapping between the two spellings is the
  thing that can be quietly wrong. Every field is given a distinct value, so
  a swap shows up as a wrong number rather than as a coincidence.
*/
const historyRow = {
  id: 'run-1',
  file_name: 'publishers-sept.csv',
  run_by: 'james@omniaagency.co',
  duplicate_mode: 'update',
  total_rows: 1400,
  created: 120,
  updated: 1050,
  skipped: 7,
  failed: 230,
  created_at: '2026-09-18T10:00:00Z',
};

check('the file name carries across', toRun(historyRow).fileName, 'publishers-sept.csv');
check('run_by is the admin who ran it', toRun(historyRow).adminEmail, 'james@omniaagency.co');
check('total_rows is what was uploaded', toRun(historyRow).rowsUploaded, 1400);
check('created is rows added', toRun(historyRow).rowsAdded, 120);
check('updated is rows updated', toRun(historyRow).rowsUpdated, 1050);
check('skipped is rows skipped', toRun(historyRow).rowsSkipped, 7);
check('failed is rows failed', toRun(historyRow).rowsFailed, 230);
check('the mode comes back as it went in', toRun(historyRow).duplicateMode, 'update');

// Anything that is not 'update' is 'skip'. A third value arriving from the
// column would otherwise reach the UI as a mode that does not exist.
check('an unknown mode reads as skip',
  toRun({ ...historyRow, duplicate_mode: 'something-else' }).duplicateMode, 'skip');

// A run recorded before run_by was set should read as blank, not "null".
check('a missing admin is blank, not the word null', toRun({ ...historyRow, run_by: null }).adminEmail, '');
check('missing counts are zero, not NaN', toRun({ id: 'x' }).rowsFailed, 0);

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
