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

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
