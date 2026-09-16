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

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
