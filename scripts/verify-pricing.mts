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
import { breakdownSteps } from '../src/lib/pricing/steps';
import { formatPrice } from '../src/lib/utils/format';
import fs from 'node:fs';
import path from 'node:path';
import {
  generalMargin,
  losingPlacements,
  marginBlock,
  placementLabel,
  placementMargins,
  serviceMargin,
  servicesInForeignCurrency,
  worstPlacement,
} from '../src/lib/utils/margin';
import type { Service } from '../src/lib/types';
import { placementPrice, tierFor } from '../src/lib/utils/pricing';
import { publishBlocker, publishBlockerMessage } from '../src/lib/websites/publishing';
import { displayRate, staleRates } from '../src/lib/pricing/rates';
import { applySummary } from '../src/lib/pricing/outcome';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string, d?: string) => {
  failed += 1;
  console.log(`  FAIL  ${l}${d ? ` - ${d}` : ''}`);
};
const is = (l: string, actual: unknown, expected: unknown) =>
  actual === expected ? ok(l) : bad(l, `expected ${String(expected)}, got ${String(actual)}`);
const has = (l: string, haystack: string, needle: string) =>
  haystack.includes(needle) ? ok(l) : bad(l, `missing ${JSON.stringify(needle)} in ${JSON.stringify(haystack)}`);

/*
  Abstract figures, not the shipped ones.

  These test the engine: given these bands and this floor, does it do the
  right thing. The numbers that actually ship are rows in `pricing_bands` and
  `pricing_rules`, editable on the pricing screen, and were converted to
  dollars by migration 0025. Pinning them here as well would make every band
  adjustment a failing test for no gain.
*/
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

const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

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
is('just under the first threshold is the flat band', bandFor(4999, bands)?.flatMinor, 4000);
is('exactly at it starts 60%', bandFor(5000, bands)?.markupPct, 60);
is('149.99 is still 60%', bandFor(14999, bands)?.markupPct, 60);
is('the next threshold starts 40%', bandFor(15000, bands)?.markupPct, 40);
is('399.99 is still 40%', bandFor(39999, bands)?.markupPct, 40);
is('and the top one starts 30%', bandFor(40000, bands)?.markupPct, 30);
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
  if (rounded < value) bad(`rounding never goes down (${money(value)})`);
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
    `  400 EUR -> ${money(b.costBaseMinor)} +fees ${money(b.feeMinor)} = ${money(b.trueCostMinor)} true, ${b.bandLabel} -> ${money(b.sellMinor)} (margin ${money(b.marginMinor)}, ${b.marginPct.toFixed(0)}%)`,
  );
  is('converted with the 4% buffer', b.costBaseMinor, 34944);
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
  is('and it is in the true cost', withVat.trueCostMinor, withVat.costBaseMinor + withVat.vatMinor);

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
  cheap.marginMinor >= 4000 ? ok(`a 10 pound placement still makes 40: ${money(cheap.marginMinor)}`) : bad('minimum margin on a cheap placement', money(cheap.marginMinor));

  // 30% of a 60 unit cost is 18, under the floor.
  const thin = computePrice(
    { costMinor: 6000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    { ...rules, minMarginMinor: 4000 },
    [{ minCostMinor: 0, markupPct: 30, flatMinor: null }],
    rounding,
  );
  is('a percentage that falls short is lifted to the floor', thin.minimumApplied, true);
  thin.marginMinor >= 4000 ? ok('and the margin clears it') : bad('lifted margin clears the floor', money(thin.marginMinor));

  // Every band, every plausible cost: the floor must never be breached.
  let breaches = 0;
  for (let cost = 100; cost <= 200000; cost += 137) {
    const b = computePrice(
      { costMinor: cost, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
      rules, bands, rounding,
    );
    if (b.marginMinor < rules.minMarginMinor) breaches += 1;
  }
  is('no cost across the whole sweep produces a margin under the floor', breaches, 0);
}

console.log('\n--- the agency tier ---');
{
  const b = computePrice(
    { costMinor: 20000, currency: 'GBP', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  is('the standard price uses the 40% band', b.bandLabel, '40%');
  b.agencyMinor < b.sellMinor ? ok(`agency pays less: ${money(b.agencyMinor)} against ${money(b.sellMinor)}`) : bad('agency pays less');
  b.agencyMinor - b.trueCostMinor >= rules.minMarginMinor
    ? ok('and the agency price still clears the minimum margin')
    : bad('agency clears the minimum', money(b.agencyMinor - b.trueCostMinor));

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
  withBuffer.costBaseMinor > without.costBaseMinor ? ok('the buffer raises the cost we price from') : bad('buffer raises cost');
  is('a 4% buffer on 84 is 87.36', withBuffer.costBaseMinor, 8736);
  is('our own currency against itself needs no conversion',
    computePrice({ costMinor: 10000, currency: 'USD', fxRate: 1, paymentMethods: ['bank'], pricesExcludeVat: false, vatRatePct: null }, { ...rules, fxBufferPct: 0 }, bands, rounding).costBaseMinor,
    10000);
}

console.log('\n--- exchange rates ---');
{
  // frankfurter publishes base -> X. Pricing needs X -> base, and getting
  // that backwards would make a European publisher look forty times cheaper.
  // The base is USD now; the inversion is the same either way, which is the
  // point of naming the field for its role rather than for a currency.
  const { rows } = ratesFromSource(
    { EUR: 0.89, GBP: 0.746, DKK: 6.63 },
    new Map(),
    '2026-09-24T00:00:00Z',
    'USD',
  );
  const eur = rows.find((row) => row.currency === 'EUR')!;
  const rate = Number(eur.rate_to_base);
  Math.abs(rate - 1.1236) < 0.001
    ? ok(`0.89 EUR per dollar becomes ${rate.toFixed(4)} USD per euro`)
    : bad('the rate is inverted', String(rate));
  rate > 1 ? ok('a euro is worth more than a dollar, as it should be') : bad('euro under a dollar');

  const gbpRate = Number(rows.find((row) => row.currency === 'GBP')!.rate_to_base);
  gbpRate > 1.2
    ? ok(`and a pound is worth ${gbpRate.toFixed(4)} dollars, not 0.746`)
    : bad('pound inverted', String(gbpRate));

  const dkk = Number(rows.find((row) => row.currency === 'DKK')!.rate_to_base);
  dkk < 0.5 ? ok(`and a krone is worth ${dkk.toFixed(4)}, not 6.63`) : bad('krone inverted', String(dkk));

  is('every row records which base it is against', eur.base_currency, 'USD');
  is(
    'the base itself is never fetched, it is fixed at 1',
    rows.some((row) => row.currency === 'USD'),
    false,
  );
  is(
    'a zero or broken rate is dropped rather than stored',
    ratesFromSource({ EUR: 0, GBP: -1, JPY: Number.NaN }, new Map(), '2026-09-24T00:00:00Z', 'USD')
      .rows.length,
    0,
  );

  // The 2% rule that triggers a recalculation.
  const previous = new Map([
    ['EUR', 1.1236],
    ['GBP', 1.28],
  ]);
  const { moved } = ratesFromSource({ EUR: 0.89, GBP: 0.746 }, previous, '2026-09-24T00:00:00Z', 'USD');
  is('a rate that barely moved does not trigger anything', moved.some((m) => m.currency === 'EUR'), false);
  is('one that moved more than 2% does', moved.some((m) => m.currency === 'GBP'), true);
  is('and the threshold is the stated 2%', RATE_MOVE_THRESHOLD_PCT, 2);

  // A publisher who quotes in our own currency needs no conversion at all,
  // which is the whole reason for the switch: most of them quote in dollars.
  const native = computePrice(
    { costMinor: 10900, currency: 'USD', fxRate: 1, paymentMethods: ['paypal'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  is('109 dollars is 109 dollars, plus only the buffer', native.costBaseMinor, Math.round(10900 * 1.04));
  console.log(
    `  109 USD -> ${money(native.costBaseMinor)} true ${money(native.trueCostMinor)} -> sells ${money(native.sellMinor)} (margin ${money(native.marginMinor)})`,
  );

  // And one who quotes in pounds is converted up, not down.
  const british = computePrice(
    { costMinor: 10900, currency: 'GBP', fxRate: 1.34, paymentMethods: ['paypal'], pricesExcludeVat: false, vatRatePct: null },
    rules, bands, rounding,
  );
  british.costBaseMinor > native.costBaseMinor
    ? ok('a pound cost converts up into dollars, not down')
    : bad('pound cost converted the wrong way', String(british.costBaseMinor));
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

console.log('\n--- how a price explains itself ---');
{
  // The breakdown is the only account anyone gets of why a listing costs what
  // it costs, so it has to end on the number actually charged and pass
  // through every step that moved it.
  // Foreign now means "not dollars". The base moved, so this test had to.
  const foreign = computePrice(
    { costMinor: 10900, currency: 'GBP', fxRate: 1.34, paymentMethods: ['paypal'],
      pricesExcludeVat: null, vatRatePct: null },
    rules, bands, rounding,
  );
  const labels = breakdownSteps(foreign).map((step) => step.label);

  is('it opens with what the publisher charges', labels[0], 'Publisher price');
  is('it ends on the agency price', labels[labels.length - 1], 'Agency price');
  is(
    'a foreign cost shows its conversion',
    labels.some((label) => label.startsWith('Converted at')),
    true,
  );
  is(
    'the publisher price keeps their currency, not ours',
    breakdownSteps(foreign)[0].value,
    '109.00 GBP',
  );
  is(
    'the true cost is shown, not just implied',
    breakdownSteps(foreign).find((step) => step.label === 'True cost')?.value,
    formatPrice(foreign.trueCostMinor),
  );
  is(
    'and the last money figure before agency is what it sells at',
    breakdownSteps(foreign).find((step) => step.label === 'Sells at')?.value,
    formatPrice(foreign.sellMinor),
  );

  const domestic = computePrice(
    { costMinor: 10000, currency: 'USD', fxRate: 1, paymentMethods: ['bank'],
      pricesExcludeVat: null, vatRatePct: null },
    rules, bands, rounding,
  );
  is(
    'a cost already in our own currency has no conversion line to read past',
    breakdownSteps(domestic).some((step) => step.label.startsWith('Converted at')),
    false,
  );
  is(
    'a publisher who charges no VAT gets no VAT line',
    breakdownSteps(domestic).some((step) => step.label === 'Publisher VAT'),
    false,
  );

  const vatted = computePrice(
    { costMinor: 10000, currency: 'USD', fxRate: 1, paymentMethods: ['bank'],
      pricesExcludeVat: true, vatRatePct: 20 },
    rules, bands, rounding,
  );
  is(
    'a publisher who adds VAT gets one',
    breakdownSteps(vatted).find((step) => step.label === 'Publisher VAT')?.value,
    formatPrice(vatted.vatMinor),
  );

  // A placement priced in the middle band gives 60%, which lands under the
  // floor. The floor is what set this price, and saying "Markup (60%)" would
  // name the wrong reason for a number somebody may have to defend.
  const tiny = computePrice(
    { costMinor: 5000, currency: 'USD', fxRate: 1, paymentMethods: ['bank'],
      pricesExcludeVat: null, vatRatePct: null },
    rules, bands, rounding,
  );
  is('the floor, not the band, set this price', tiny.minimumApplied, true);
  is(
    'and the floor is what the breakdown says set it',
    breakdownSteps(tiny).some((step) => step.label.includes('minimum margin')),
    true,
  );
}

console.log('\n--- a cost is never subtracted from a price in other money ---');
{
  // The bug this suite exists to prevent: a publisher charging $109 was shown
  // as costing £109, and the editor printed "£36 profit" on a sell price of
  // £145. The real cost is nearer £93 once converted, buffered and paid for,
  // and the real margin is nearer £52. Both numbers are wrong, and the wrong
  // one is the one somebody sets prices from.
  const base = {
    id: 'svc', websiteId: 'w1', type: 'guest-post' as const,
    turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true,
  };
  const dollars: Service = { ...base, priceMinor: 14500, costPriceMinor: 10900, costCurrency: 'USD' };
  const pounds: Service = { ...base, priceMinor: 14500, costPriceMinor: 10900, costCurrency: 'GBP' };
  const unstated: Service = { ...base, priceMinor: 14500, costPriceMinor: 10900 };
  const noCost: Service = { ...base, priceMinor: 14500 };

  is('a dollar cost yields no sterling margin', serviceMargin(dollars, 'GBP'), null);
  is('and says why', marginBlock(dollars, 'GBP'), 'foreign-currency');
  is('a sterling cost still does', serviceMargin(pounds, 'GBP')?.profitMinor, 3600);
  is('and is not blocked', marginBlock(pounds, 'GBP'), null);

  // An unrecorded currency is a gap, not a quiet vote for ours.
  is('an unstated currency yields no margin either', serviceMargin(unstated, 'GBP'), null);
  is('and is not reported as a missing cost', marginBlock(unstated, 'GBP'), 'foreign-currency');
  is('a missing cost still reads as one', marginBlock(noCost, 'GBP'), 'no-cost');

  // A foreign cost is dropped rather than added in at face value, which
  // would understate the margin on every mixed listing.
  const site = { services: [pounds, { ...dollars, type: 'niche-edit' as const }], nichePrices: [] };
  is('only what can be compared gets a margin', placementMargins(site, undefined, 'GBP').length, 1);
  is('and counts the foreign one so it can be explained', servicesInForeignCurrency(site, 'GBP'), 1);

  // Selling in dollars one day would make the dollar cost the comparable one.
  is('the comparison follows what we sell in', serviceMargin(dollars, 'USD')?.profitMinor, 3600);
}

console.log('\n--- the admin table, per placement and in our own money ---');
{
  // The row used to sum both placements: both prices added together, both
  // costs added together, one profit underneath. It described a sale nobody
  // makes - a customer buys a guest post or a niche edit, never both - and it
  // hid the thing the table exists to show, because a fat guest post margin
  // covers a niche edit sold below cost and the total still reads healthy.
  const base = {
    websiteId: 'w1', turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true,
  };
  const site = {
    services: [
      { ...base, id: 'a', type: 'guest-post' as const, priceMinor: 15500, costPriceMinor: 10900, costCurrency: 'USD' },
      { ...base, id: 'b', type: 'niche-edit' as const, priceMinor: 9500, costPriceMinor: 5000, costCurrency: 'USD' },
    ],
    nichePrices: [],
  };

  // Keyed by niche, then placement. The general rate lives under the empty
  // string, which is how `price_calculations` records it.
  const trueCosts = { '': { 'guest-post': 9313, 'niche-edit': 4300 } };
  const margins = placementMargins(site, trueCosts);

  is('one line per placement, not one for the site', margins.length, 2);
  is('the engine\u2019s converted cost is the one used', margins[0]?.costMinor, 9313);
  is('and the profit is that placement alone', margins[0]?.profitMinor, 15500 - 9313);
  is('as a percentage of its own price', margins[0]?.marginPct, 39.9);
  is('the other stands on its own too', margins[1]?.profitMinor, 9500 - 4300);
  is('and is marked as the engine\u2019s figure', margins[0]?.converted, true);

  // The whole point: the thinnest margin, because the best case is never the
  // one losing money.
  is('the worst placement is the one reported', worstPlacement(margins)?.type, 'guest-post');

  const hidden = placementMargins(site, { '': { 'guest-post': 9313, 'niche-edit': 11000 } });
  // Summed, this listing shows 25000 - 20313 = a healthy 18.7%. Per
  // placement, the niche edit is 1500 in the red and cannot hide.
  is('a losing placement is not hidden by a winning one', losingPlacements(hidden).length, 1);
  is('and it is the one reported as worst', worstPlacement(hidden)?.type, 'niche-edit');
  is('with the loss stated', worstPlacement(hidden)?.profitMinor, -1500);

  // We sell in dollars, so a dollar cost needs no engine to be comparable.
  // A placement the engine has not reached falls back to the publisher's own
  // number rather than vanishing from the table.
  const halfPriced = placementMargins(site, { '': { 'guest-post': 9313 } });
  is('the engine\u2019s figure wins where there is one', halfPriced[0]?.costMinor, 9313);
  is('and the other falls back to the raw cost', halfPriced[1]?.costMinor, 5000);
  is('which is marked as not the engine\u2019s', halfPriced[1]?.converted, false);
  is('a site the engine has never seen still shows both', placementMargins(site, undefined).length, 2);

  // A cost in a currency we do not sell in is left out entirely rather than
  // subtracted anyway. Subtracting 109 pounds from 155 dollars produces a
  // number, and the number is nonsense.
  const foreign = {
    services: [{ ...base, id: 'a', type: 'guest-post' as const, priceMinor: 15500, costPriceMinor: 10900, costCurrency: 'GBP' }],
    nichePrices: [],
  };
  is('a cost we cannot compare is left out', placementMargins(foreign, undefined).length, 0);
  is('until the engine converts it', placementMargins(foreign, { '': { 'guest-post': 9313 } }).length, 1);

  // No sell price is not a loss. Every listing sourced from an email arrives
  // at zero on purpose, and calling three hundred of those "below cost" would
  // bury the handful that really are.
  const draft = {
    services: [{ ...base, id: 'a', type: 'guest-post' as const, priceMinor: 0, costPriceMinor: 10900, costCurrency: 'USD' }],
    nichePrices: [],
  };
  const draftMargins = placementMargins(draft);
  is('an unpriced placement says so', draftMargins[0]?.unpriced, true);
  is('and is not counted as losing money', losingPlacements(draftMargins).length, 0);
  is('nor offered as the worst margin', worstPlacement(draftMargins), null);

  // The sell price comes from the listing, not the calculation, so a price
  // set by hand shows the margin actually being earned on it.
  const overridden = {
    services: [{ ...base, id: 'a', type: 'guest-post' as const, priceMinor: 12000, costPriceMinor: 10900, costCurrency: 'USD' }],
    nichePrices: [],
  };
  is(
    'a hand-set price is measured against the real cost',
    placementMargins(overridden, { '': { 'guest-post': 9313 } })[0]?.profitMinor,
    2687,
  );
}

console.log('\n--- gambling has its own cost, and its own margin ---');
{
  // The one this was built for. A publisher quotes 400 generally and 700 for
  // gambling. The general rate was the only thing measured, so the listing
  // showed a healthy margin while every gambling order lost money - and
  // gambling is the topic the whole niche landing page exists to sell.
  const base = { websiteId: 'w1', turnaroundMinDays: 1, turnaroundMaxDays: 5, available: true };
  const site = {
    services: [{ ...base, id: 'a', type: 'guest-post' as const, priceMinor: 55000 }],
    nichePrices: [
      { websiteId: 'w1', niche: 'gambling', linkType: 'guest-post' as const, priceMinor: 55000 },
    ],
  };

  // 400 general, 700 for gambling, both converted by the engine.
  const costs = { '': { 'guest-post': 40000 }, gambling: { 'guest-post': 70000 } };
  const margins = placementMargins(site, costs);

  is('the rate card gets a line of its own', margins.length, 2);
  is('the general placement is fine', margins[0]?.profitMinor, 15000);
  is('and the gambling one is not', margins[1]?.profitMinor, -15000);
  is('which is the one reported', worstPlacement(margins)?.niche, 'gambling');
  is('and it is named in words, not slugs', placementLabel(worstPlacement(margins)!), 'Gambling and iGaming Guest Post');
  is('the loss is counted', losingPlacements(margins).length, 1);

  // Summed the old way this listing looked healthy: one placement, 550
  // against 400. The topic rate is where the money went.
  is('publishing it is refused', publishBlocker(site, costs), 'below-cost');

  // Priced properly for gambling, it publishes.
  const priced = {
    ...site,
    nichePrices: [
      { websiteId: 'w1', niche: 'gambling', linkType: 'guest-post' as const, priceMinor: 95000 },
    ],
  };
  is('once the gambling rate covers the gambling cost', publishBlocker(priced, costs), null);
  // 950 against 700 is 26.3%; 550 against 400 is 27.3%. Gambling is still the
  // thinner of the two, which is the point of reporting the worst rather than
  // the average - the topic somebody actually buys is the one under pressure.
  is('though it is still the thinner of the two', worstPlacement(placementMargins(priced, costs))?.niche, 'gambling');
  is('and both are now in profit', losingPlacements(placementMargins(priced, costs)).length, 0);

  // The dangerous case, and the reason topic lines come from both sides.
  // Approving a publisher's email writes their gambling cost immediately; the
  // gambling sell price only appears when the engine next runs. In between,
  // the site is on sale for gambling at its general price while gambling
  // costs 700 - and until this looked at the cost as well as the price, no
  // screen said so.
  const noOverride = { ...site, nichePrices: [] };
  const exposed = placementMargins(noOverride, costs);
  is('a dearer cost makes a line of its own without a price', exposed.length, 2);
  is('priced at the general rate', exposed[1]?.priceMinor, 55000);
  is('against the gambling cost', exposed[1]?.costMinor, 70000);
  is('which is a loss nobody had declared', losingPlacements(exposed).length, 1);
  is('and publishing it is refused', publishBlocker(noOverride, costs), 'below-cost');

  // The column showing the general price must read the general line, matched
  // on topic as well as placement. On this listing the general cost is
  // missing and the gambling one is not, so the first guest post line IS the
  // gambling one - and finding by placement alone printed a zero sell price
  // beside a hundred and three pounds of profit.
  const noGeneralCost = placementMargins(site, { gambling: { 'guest-post': 70000 } });
  is('the first line for this placement is the topic one', noGeneralCost[0]?.niche, 'gambling');
  is('so the general column finds nothing rather than the wrong thing',
    generalMargin(noGeneralCost, 'guest-post'), undefined);
  is('and where there is a general line it is that one',
    generalMargin(margins, 'guest-post')?.niche, null);

  // A topic that costs the general rate and sells at it is not a second line.
  // It would repeat the general margin under a dozen headings and drown the
  // one that differs.
  const sameAsGeneral = { '': { 'guest-post': 40000 }, gambling: { 'guest-post': 40000 } };
  is(
    'a topic that matches the general rate on both sides is not a line',
    placementMargins(noOverride, sameAsGeneral).length,
    1,
  );

  // A topic rate on a placement nobody can buy is not a loss.
  const withdrawn = {
    ...site,
    services: [{ ...base, id: 'a', type: 'guest-post' as const, priceMinor: 55000, available: false }],
  };
  is('a withdrawn placement blocks for its own reason', publishBlocker(withdrawn, costs), 'priced-but-off');

  // Without the engine's figures nothing can be said about a topic rate, and
  // saying nothing is right: the publisher's own number is in their currency.
  is('no calculations means no topic margins', placementMargins(site, undefined).length, 0);
}

console.log('\n--- what stops a listing being published ---');
{
  const service = (patch: Record<string, unknown> = {}) => ({
    id: 's', websiteId: 'w', type: 'guest-post' as const,
    turnaroundMinDays: 1, turnaroundMaxDays: 5,
    priceMinor: 19500, available: true, ...patch,
  });

  is('a priced, switched-on listing publishes', publishBlocker({ services: [service()], nichePrices: [] }), null);
  is(
    'no services at all is unpriced',
    publishBlocker({ services: [], nichePrices: [] }),
    'unpriced',
  );
  is(
    'a service priced at zero is unpriced',
    publishBlocker({ services: [service({ priceMinor: 0 })], nichePrices: [] }),
    'unpriced',
  );

  // The one that cost an afternoon: sourcing creates services priced at zero
  // and switched off, the engine wrote a price and left them switched off,
  // and the guard said "no sell price" about a listing showing $195.
  is(
    'priced but switched off is its own answer, not "unpriced"',
    publishBlocker({ services: [service({ available: false })], nichePrices: [] }),
    'priced-but-off',
  );
  publishBlockerMessage('priced-but-off').includes('switched off')
    ? ok('and the message says so rather than denying the price exists')
    : bad('the message still claims there is no price');

  // One sellable placement is enough, whatever the others are doing.
  is(
    'one good placement among dead ones is enough',
    publishBlocker({
      services: [service({ available: false }), service({ id: 'b', type: 'niche-edit' as const })],
      nichePrices: [],
    }),
    null,
  );

  // A placement on sale for less than we pay for it. The engine cannot make
  // one - it lifts every markup to the minimum margin and rounds up - so this
  // is a hand-set price, or a publisher who raised theirs after we priced
  // them, which moves the cost and leaves the sell price exactly where it was.
  is(
    'selling below cost blocks publishing',
    publishBlocker({ services: [service({ priceMinor: 9000, costPriceMinor: 10900, costCurrency: 'USD' })], nichePrices: [] }),
    'below-cost',
  );
  is(
    'and so does selling at exactly cost',
    publishBlocker({ services: [service({ priceMinor: 10900, costPriceMinor: 10900, costCurrency: 'USD' })], nichePrices: [] }),
    'below-cost',
  );
  is(
    'a cent of margin is enough to publish',
    publishBlocker({ services: [service({ priceMinor: 10901, costPriceMinor: 10900, costCurrency: 'USD' })], nichePrices: [] }),
    null,
  );
  // A cost in a currency we do not sell in needs the rate, the buffer and the
  // fee before it means anything against our price, and none of that is on
  // the service row. Comparing it here would refuse listings that are fine.
  is(
    'a foreign cost is left alone rather than compared badly',
    publishBlocker({ services: [service({ priceMinor: 9000, costPriceMinor: 10900, costCurrency: 'GBP' })], nichePrices: [] }),
    null,
  );
  // A loss on a placement nobody can buy is not a loss.
  is(
    'a switched-off placement below cost does not block a good one',
    publishBlocker({
      services: [
        service({ available: false, priceMinor: 9000, costPriceMinor: 10900, costCurrency: 'USD' }),
        service({ id: 'b', type: 'niche-edit' as const }),
      ],
      nichePrices: [],
    }),
    null,
  );
  publishBlockerMessage('below-cost').includes('below what we pay')
    ? ok('and the message names the problem')
    : bad('the below-cost message does not say what is wrong');
}

console.log('\n--- a pricing run says why it skipped things ---');
{
  // The run already works out why a listing could not be priced and used to
  // throw both reasons away. The screen said "Repriced 2,431" and stopped,
  // which is no help at all to somebody looking at a page of listings priced
  // at zero.
  const clean = applySummary({ priced: 2431, skippedOverrides: 0, missingRates: [], noCurrency: [] });
  is('a clean run says only what it did', clean, 'Repriced 2431 placements.');

  const messy = applySummary({
    priced: 2400,
    skippedOverrides: 12,
    missingRates: ['AUD', 'BRL'],
    noCurrency: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com', 'f.com'],
  });
  has('overrides are named as left alone, not as failures', messy, '12 left alone as overrides');
  has('listings with no currency are counted', messy, '6 listings have no cost currency');
  has('and a few are named', messy, 'a.com, b.com, c.com, d.com and 2 more');
  has('missing rates are named by currency', messy, 'No exchange rate for AUD, BRL');

  // "Placements", because a listing has two or three of them and a count
  // larger than the inventory reads as a bug rather than as arithmetic.
  has('the unit is stated', clean, 'placements');
  has('and it is singular when it should be',
    applySummary({ priced: 1, skippedOverrides: 0, missingRates: [], noCurrency: [] }),
    '1 placement.');

  has('the verb can be changed for the save-and-reprice button',
    applySummary({ priced: 5, skippedOverrides: 0, missingRates: [], noCurrency: [] }, 'Saved and repriced'),
    'Saved and repriced 5');
}

console.log('\n--- no pricing read is allowed to come back half full ---');
/*
  The one that cost nine hundred listings.

  `calculate` used to fetch services, niche costs and niche prices whole - no
  filter, no paging - and narrow them in the loops afterwards. That works
  until the inventory outgrows one page of rows, and then it fails in the
  worst way there is: the rows past the end are never priced, and nothing
  anywhere says so. Listings came back from approval with their cost recorded
  and their sell price still zero, including when the run was asked for that
  one listing by id.

  Checked in the source rather than remembered, because the next person to add
  a table here will write the same unfiltered select, and the symptom is
  silence.
*/
{
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/lib/services/pricing-service.ts'),
    'utf8',
  );

  /*
    One query, not everything after it.

    Splitting on the semicolon was the first attempt, and it passed with the
    filter deleted: these three queries sit inside one `await Promise.all([
    ... ]);`, so the text after the first of them contained the other two -
    and their filters counted as its own. A query ends at the next `.from(`.
  */
  const queriesOn = (table: string) => {
    const found: string[] = [];
    const opener = `.from('${table}')`;
    for (let at = source.indexOf(opener); at !== -1; at = source.indexOf(opener, at + 1)) {
      const rest = source.slice(at + opener.length);
      const nextTable = rest.indexOf('.from(');
      const end = rest.indexOf(';');
      const stop = [nextTable, end].filter((index) => index !== -1);
      found.push(rest.slice(0, stop.length ? Math.min(...stop) : rest.length));
    }
    return found.filter((query) => query.includes('.select('));
  };

  const keyedToAWebsite = ['services', 'website_niche_costs', 'website_niche_prices'];
  const unbounded: string[] = [];

  for (const table of keyedToAWebsite) {
    for (const query of queriesOn(table)) {
      if (!query.includes("in('website_id'")) unbounded.push(table);
    }
  }

  is('every pricing read is keyed to the listings it is for', unbounded.join(','), '');

  // price_calculations is read for the whole table by the websites screen, so
  // it cannot be keyed the same way - it is paged instead.
  const calculations = queriesOn('price_calculations');
  is('there is a read to check', calculations.length > 0, true);
  is(
    'and the one that cannot be keyed is paged',
    calculations.every((query) => query.includes('.range(')),
    true,
  );
}

console.log('\n--- what the rates panel should say ---');
{
  // Three screens have now been written that treated GBP as the base after
  // the base became USD. The engine was never wrong - the rate in the table
  // was right every time - but the screen said the pound and the dollar were
  // worth the same, which reads as a rate rather than as a bug.
  const rateFor = new Map<string, number | null>([
    ['GBP', 1.3263],
    ['EUR', 1.1378],
    ['RUB', null],
  ]);

  is('the base is one against itself', displayRate('USD', rateFor, 'USD'), 1);
  is('and the pound is not the base any more', displayRate('GBP', rateFor, 'USD'), 1.3263);
  is('a currency with no rate says so', displayRate('RUB', rateFor, 'USD'), null);
  is('and one nobody has heard of does too', displayRate('XYZ', rateFor, 'USD'), null);
  // The rule is about the base, not about a particular currency: if we ever
  // sell in pounds again, this keeps working without an edit.
  is('whatever the base happens to be', displayRate('GBP', rateFor, 'GBP'), 1);

  const rates = [
    { currency: 'USD', rateToBase: 1, ageDays: 40 },
    { currency: 'EUR', rateToBase: 1.1378, ageDays: 0.1 },
    { currency: 'PLN', rateToBase: 0.25, ageDays: 9 },
  ];
  is('the base is never stale, it is never fetched', staleRates(rates, 3, 'USD').join(), 'PLN');
  is('a fresh rate is not counted', staleRates(rates, 3, 'USD').includes('EUR'), false);
  is('and nothing old means nothing to warn about', staleRates([rates[1]!], 3, 'USD').length, 0);
}

console.log(failed ? `\n  ${failed} FAILED\n` : '\n  all passed\n');
process.exit(failed ? 1 : 0);
