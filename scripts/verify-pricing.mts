/**
 * Prove the pricing rules do what the brief says.
 *
 * No database and no network: the engine is pure, so every commercial rule
 * can be checked by calling it. This is the suite that matters most in the
 * codebase - a wrong band or a rounding rule that goes the wrong way does not
 * throw, it just sells the whole inventory at the wrong price.
 */
import {
  bandFor,
  computePrice,
  paymentFee,
  roundUp,
  type MarkupBand,
  type PricingRules,
  type RoundingTier,
} from '../src/lib/pricing/engine';
import { ratesFromSource, RATE_MOVE_THRESHOLD_PCT } from '../src/lib/services/fx-service';
import { placementPrice, tierFor } from '../src/lib/utils/pricing';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string, d?: string) => {
  failed += 1;
  console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`);
};
const is = (l: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(l) : bad(l, `expected ${String(expected)}, got ${String(actual)}`);

const rules: PricingRules = {
  fxBufferPct: 4,
  paypalFeePct: 4,
  paypalFeeFixedMinor: 30,
  cryptoFeePct: 1,
  bankFeePct: 0,
  bankFeeFixedMinor: 0,
  vatReclaimable: false,
  minMarginMinor: 4000,
  agencyDiscountPoints: 10,
};

const bands: MarkupBand[] = [
  { minCostMinor: 0, markupPct: null, flatMinor: 4000 },
  { minCostMinor: 5000, markupPct: 60, flatMinor: null },
  { minCostMinor: 15000, markupPct: 40, flatMinor: null },
  { minCostMinor: 40000, markupPct: 30, flatMinor: null },
];

const rounding: RoundingTier[] = [
  { minMinor: 0, allowedLastDigits: [5, 9] },
  { minMinor: 10000, allowedLastDigits: [5, 9] },
  { minMinor: 100000, allowedLastDigits: [9] },
];

const gbp = (minor: number) => `£${(minor / 100).toFixed(2)}`;

console.log('\n--- payment fees: the cheapest method we could actually use ---');
is('PayPal is 4% plus 30p', paymentFee(10000, ['paypal'], rules).feeMinor, 430);
is('bank transfer is free', paymentFee(10000, ['bank'], rules).feeMinor, 0);
is('an invoice is free', paymentFee(10000, ['invoice'], rules).feeMinor, 0);
is('crypto is 1%', paymentFee(10000, ['crypto'], rules).feeMinor, 100);
is(
  'offered both, we bank transfer',
  paymentFee(10000, ['paypal', 'bank'], rules).label,
  'bank transfer',
);
is(
  'offered PayPal and crypto, crypto is cheaper',
  paymentFee(10000, ['paypal', 'crypto'], rules).label,
  'crypto',
);
is(
  'a publisher who said nothing is costed as PayPal, not as free',
  paymentFee(10000, [], rules).feeMinor,
  430,
);
is(
  'and a rail we have no account for is not costed at zero either',
  paymentFee(10000, ['pix'], rules).feeMinor,
  430,
);

console.log('\n--- the bands ---');
is('just under 50 pounds is the flat band', bandFor(4999, bands)?.flatMinor, 4000);
is('exactly 50 pounds starts 60%', bandFor(5000, bands)?.markupPct, 60);
is('149.99 is still 60%', bandFor(14999, bands)?.markupPct, 60);
is('150 pounds starts 40%', bandFor(15000, bands)?.markupPct, 40);
is('399.99 is still 40%', bandFor(39999, bands)?.markupPct, 40);
is('400 pounds starts 30%', bandFor(40000, bands)?.markupPct, 30);
is('and a large cost stays in the top band', bandFor(500000, bands)?.markupPct, 30);

console.log('\n--- rounding, always upward ---');
is('91 becomes 95', roundUp(9100, rounding), 9500);
is('96 becomes 99', roundUp(9600, rounding), 9900);
is('a price already on an ending is left alone', roundUp(9500, rounding), 9500);
is('pence always round up to the pound', roundUp(9401, rounding), 9500);
is('141 becomes 145', roundUp(14100, rounding), 14500);
is('146 becomes 149', roundUp(14600, rounding), 14900);
is('246 becomes 249', roundUp(24600, rounding), 24900);
is('1291 becomes 1299', roundUp(129100, rounding), 129900);
is('above a thousand it must end in 9, so 1300 becomes 1309', roundUp(130000, rounding), 130900);
[9100, 12345, 45600, 99999, 250000].forEach((value) => {
  const rounded = roundUp(value, rounding);
  if (rounded < value) bad(`rounding never goes down (${gbp(value)})`);
});
ok('rounding never returns less than it was given');

console.log('\n--- a whole price, worked through ---');
{
  // 400 EUR, bank transfer, no VAT: the Danish network from the inbox.
  const b = computePrice(
    {
      costMinor: 40000,
      currency: 'EUR',
      fxRate: 0.84,
      paymentMethods: ['bank'],
      pricesExcludeVat: true,
      vatRatePct: null,
    },
    rules,
    bands,
    rounding,
  );
  console.log(
    `  400 EUR -> ${gbp(b.costGbpMinor)} +fees ${gbp(b.feeMinor)} = ${gbp(b.trueCostMinor)} true, ${b.bandLabel} -> ${gbp(b.sellMinor)} (margin ${gbp(b.marginMinor)}, ${b.marginPct.toFixed(0)}%)`,
  );
  is('converted with the 4% buffer', b.costGbpMinor, 34944);
  is('bank transfer costs nothing', b.feeMinor, 0);
  is('no VAT rate stated, so none added', b.vatMinor, 0);
  is('true cost is the converted cost', b.trueCostMinor, 34944);
  is('which lands in the 40% band', b.bandLabel, '40%');
  b.sellMinor > b.trueCostMinor ? ok('and sells above cost') : bad('sells above cost');
  is('the price ends in a 9 or a 5', b.sellMinor % 1000 === 900 || b.sellMinor % 1000 === 500, true);
}

console.log('\n--- VAT a publisher charges us ---');
{
  const withVat = computePrice(
    { costMinor: 40000, currency: 'DKK', fxRate: 0.11, paymentMethods: ['bank'], pricesExcludeVat: true, vatRatePct: 25 },
    rules, bands, rounding,
  );
  withVat.vatMinor > 0 ? ok('25% Danish VAT is a real cost while it is not reclaimable') : bad('VAT added');
  is('and it is in the true cost', withVat.trueCostMinor, withVat.costGbpMinor + withVat.vatMinor);

  const reclaimable = computePrice(
    { costMinor: 40000, currency: 'DKK', fxRate: 0.11, paymentMethods: ['bank'], pricesExcludeVat: true, vatRatePct: 25 },
    { ...rules, vatReclaimable: true }, bands, rounding,
  );
  is('turning reclaim on takes it out of the cost', reclaimable.vatMinor, 0);
  reclaimable.sellMinor < withVat.sellMinor ? ok('so the price drops') : bad('reclaim lowers the price');

  const inclusive = computePrice(
    { costMinor: 40000, currency: 'DKK', fxRate: 0.11, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: 25 },
    rules, bands, rounding,
  );
  is('a price that already includes VAT has none added', inclusive.vatMinor, 0);
}

console.log('\n--- the minimum margin ---');
{
  const cheap = computePrice(
    { costMinor: 1000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  cheap.marginMinor >= 4000 ? ok(`a 10 pound placement still makes 40: ${gbp(cheap.marginMinor)}`) : bad('minimum margin on a cheap placement', gbp(cheap.marginMinor));

  // 30% of a 60 pound cost is 18 pounds, under the floor.
  const thin = computePrice(
    { costMinor: 6000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    { ...rules, minMarginMinor: 4000 },
    [{ minCostMinor: 0, markupPct: 30, flatMinor: null }],
    rounding,
  );
  is('a percentage that falls short is lifted to the floor', thin.minimumApplied, true);
  thin.marginMinor >= 4000 ? ok('and the margin clears it') : bad('lifted margin clears the floor', gbp(thin.marginMinor));

  // Every band, every plausible cost: the floor must never be breached.
  let breaches = 0;
  for (let cost = 100; cost <= 200000; cost += 137) {
    const b = computePrice(
      { costMinor: cost, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
      rules, bands, rounding,
    );
    if (b.marginMinor < rules.minMarginMinor) breaches += 1;
  }
  is('no cost from 1 to 2000 pounds produces a margin under the floor', breaches, 0);
}

console.log('\n--- the agency tier ---');
{
  const b = computePrice(
    { costMinor: 20000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  is('the standard price uses the 40% band', b.bandLabel, '40%');
  b.agencyMinor < b.sellMinor ? ok(`agency pays less: ${gbp(b.agencyMinor)} against ${gbp(b.sellMinor)}`) : bad('agency pays less');
  b.agencyMinor - b.trueCostMinor >= rules.minMarginMinor
    ? ok('and the agency price still clears the minimum margin')
    : bad('agency clears the minimum', gbp(b.agencyMinor - b.trueCostMinor));

  // Where the discount would take the margin under the floor, the floor wins.
  let agencyBreaches = 0;
  for (let cost = 100; cost <= 200000; cost += 311) {
    const price = computePrice(
      { costMinor: cost, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
      rules, bands, rounding,
    );
    if (price.agencyMinor - price.trueCostMinor < rules.minMarginMinor) agencyBreaches += 1;
  }
  is('no agency price anywhere breaches the floor', agencyBreaches, 0);

  const flat = computePrice(
    { costMinor: 2000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  is('in the flat band an agency gets the same price', flat.agencyMinor, flat.sellMinor);
}

console.log('\n--- the FX buffer ---');
{
  const withBuffer = computePrice(
    { costMinor: 10000, currency: 'EUR', fxRate: 0.84, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  const without = computePrice(
    { costMinor: 10000, currency: 'EUR', fxRate: 0.84, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    { ...rules, fxBufferPct: 0 }, bands, rounding,
  );
  withBuffer.costGbpMinor > without.costGbpMinor ? ok('the buffer raises the cost we price from') : bad('buffer raises cost');
  is('a 4% buffer on 84 pounds is 87.36', withBuffer.costGbpMinor, 8736);
  is('GBP against itself needs no conversion', 
    computePrice({ costMinor: 10000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null }, { ...rules, fxBufferPct: 0 }, bands, rounding).costGbpMinor,
    10000);
}

console.log('\n--- exchange rates ---');
{
  // frankfurter publishes GBP -> X. Pricing needs X -> GBP, and getting that
  // backwards would make a European publisher look forty times cheaper.
  const { rows } = ratesFromSource({ EUR: 1.19, USD: 1.27, DKK: 8.87 }, new Map(), '2026-09-24T00:00:00Z');
  const eur = rows.find((row) => row.currency === 'EUR')!;
  const rate = Number(eur.rate_to_gbp);
  Math.abs(rate - 0.840336) < 0.0001
    ? ok(`1.19 EUR per pound becomes ${rate.toFixed(4)} GBP per euro`)
    : bad('the rate is inverted', String(rate));
  rate < 1 ? ok('a euro is worth less than a pound, as it should be') : bad('euro under a pound');

  const dkk = Number(rows.find((row) => row.currency === 'DKK')!.rate_to_gbp);
  dkk < 0.2 ? ok(`and a krone is worth ${dkk.toFixed(4)}, not 8.87`) : bad('krone inverted', String(dkk));

  is('GBP is never fetched, it is fixed at 1', rows.some((row) => row.currency === 'GBP'), false);
  is('a zero or broken rate is dropped rather than stored',
    ratesFromSource({ EUR: 0, USD: -1, JPY: Number.NaN }, new Map(), '2026-09-24T00:00:00Z').rows.length, 0);

  // The 2% rule that triggers a recalculation.
  const previous = new Map([['EUR', 0.84], ['USD', 0.79]]);
  const { moved } = ratesFromSource({ EUR: 1.19, USD: 1.30 }, previous, '2026-09-24T00:00:00Z');
  is('a rate that barely moved does not trigger anything', moved.some((m) => m.currency === 'EUR'), false);
  is('one that moved more than 2% does', moved.some((m) => m.currency === 'USD'), true);
  is('and the threshold is the stated 2%', RATE_MOVE_THRESHOLD_PCT, 2);

  // A price computed at the stored rate must match one computed by hand.
  const priced = computePrice(
    { costMinor: 10900, currency: 'USD', fxRate: 1 / 1.27, paymentMethods: ['paypal'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  const expectedGbp = Math.round((10900 / 1.27) * 1.04);
  is('109 dollars converts as expected', priced.costGbpMinor, expectedGbp);
  console.log(`  109 USD -> ${gbp(priced.costGbpMinor)} true ${gbp(priced.trueCostMinor)} -> sells ${gbp(priced.sellMinor)} (margin ${gbp(priced.marginMinor)})`);
}

console.log('\n--- which buyer is charged what ---');
{
  const site = {
    services: [
      { id: 's1', websiteId: 'w1', type: 'guest-post' as const, priceMinor: 29500, agencyPriceMinor: 27500,
        turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true },
    ],
    nichePrices: [
      { niche: 'gambling', linkType: 'guest-post' as const, priceMinor: 49500, agencyPriceMinor: 44500 },
    ],
  };

  is('a starter account is standard', tierFor('starter'), 'standard');
  is('growth is standard too', tierFor('growth'), 'standard');
  is('only agency is agency', tierFor('agency'), 'agency');
  is('and an unknown plan is standard', tierFor(undefined), 'standard');

  is('a standard buyer pays the list price', placementPrice(site, 'guest-post')!.priceMinor, 29500);
  is('an agency pays the agency price', placementPrice(site, 'guest-post', null, 'agency')!.priceMinor, 27500);
  is('and is told so', placementPrice(site, 'guest-post', null, 'agency')!.agencyRate, true);
  is('a standard buyer is not', placementPrice(site, 'guest-post')!.agencyRate, false);

  is('a standard buyer pays the niche price', placementPrice(site, 'guest-post', 'gambling')!.priceMinor, 49500);
  is('an agency pays the agency niche price', placementPrice(site, 'guest-post', 'gambling', 'agency')!.priceMinor, 44500);
  is(
    'and the comparison shown is agency against agency',
    placementPrice(site, 'guest-post', 'gambling', 'agency')!.listPriceMinor,
    27500,
  );

  // A calculation fault must never charge a loyal customer more.
  const wrong = {
    services: [{ id: 's1', websiteId: 'w1', type: 'guest-post' as const, priceMinor: 10000, agencyPriceMinor: 15000,
      turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true }],
    nichePrices: [],
  };
  is(
    'an agency price above the standard one is ignored',
    placementPrice(wrong, 'guest-post', null, 'agency')!.priceMinor,
    10000,
  );

  const unpriced = {
    services: [{ id: 's1', websiteId: 'w1', type: 'guest-post' as const, priceMinor: 20000,
      turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true }],
    nichePrices: [],
  };
  is(
    'where nothing has been calculated everyone pays the same',
    placementPrice(unpriced, 'guest-post', null, 'agency')!.priceMinor,
    20000,
  );
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
