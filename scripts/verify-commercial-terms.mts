/**
 * One bad answer must not cost the whole row.
 *
 * `website_commercials` holds fifteen of a publisher's answers in one row,
 * and five of its columns are constrained. A value the column refuses fails
 * the statement - and the statement carries `cost_currency`, the unit for a
 * cost written to `service_costs` moments earlier. 410 listings are in that
 * state: a figure for what we pay, and no record of which money it is.
 *
 * What matters here is which values survive, which are dropped, and - the
 * part that caused the damage - that dropping one never takes the currency
 * with it.
 *
 * No database, no network, no key.
 */

import { commercialTerms } from '../src/lib/sourcing/commercial-terms';

let failures = 0;
function is(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ` - expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
}

console.log('\n--- an ordinary set of terms ---');
{
  const { row, dropped } = commercialTerms({
    currency: 'eur',
    homepage_link_cost: 250,
    homepage_link_period: 'month',
    payment_timing: 'prepaid',
    price_valid_until: '2026-12-31',
    payment_methods: ['paypal'],
  });
  is('the currency is an ISO code', row.cost_currency, 'EUR');
  is('a cost becomes minor units', row.homepage_link_cost_minor, 25_000);
  is('a period comes through', row.homepage_link_period, 'month');
  is('so does the timing', row.payment_timing, 'prepaid');
  is('and a real date', row.price_valid_until, '2026-12-31');
  is('nothing was dropped', dropped, []);
}

console.log('\n--- the values the column refuses ---');
{
  // A publisher whose homepage link is free. The column is `> 0`, so this
  // used to fail the statement outright.
  const zero = commercialTerms({ currency: 'USD', homepage_link_cost: 0 });
  is('a cost of zero is left out', 'homepage_link_cost_minor' in zero.row, false);
  is('and reported by name', zero.dropped, ['homepage_link_cost']);
  is('while the currency survives', zero.row.cost_currency, 'USD');
}
{
  const bad = commercialTerms({ currency: 'GBP', price_valid_until: 'end of the year' });
  is('a date that is not a date is left out', 'price_valid_until' in bad.row, false);
  is('and reported', bad.dropped, ['price_valid_until']);
  is('with the currency kept', bad.row.cost_currency, 'GBP');
}
{
  // Matches the shape and is not a day. Checked by round trip rather than by
  // regex, or it would be rolled forward into March without comment.
  const overflow = commercialTerms({ currency: 'GBP', price_valid_until: '2026-02-30' });
  is('nor is the thirtieth of February', 'price_valid_until' in overflow.row, false);
  is('reported too', overflow.dropped, ['price_valid_until']);
}
{
  const period = commercialTerms({ currency: 'GBP', banner_period: 'weekly', banner_cost: 50 });
  is('a period outside the list is left out', 'banner_period' in period.row, false);
  is('but its cost is kept, being fine on its own', period.row.banner_cost_minor, 5_000);
  is('and the period is reported', period.dropped, ['banner_period']);
}
{
  const timing = commercialTerms({ currency: 'GBP', payment_timing: 'net-30' });
  is('a timing outside the list is left out', 'payment_timing' in timing.row, false);
  is('and reported', timing.dropped, ['payment_timing']);
}
{
  // The model declining to answer is not the column refusing a value.
  const unknown = commercialTerms({ currency: 'GBP', payment_timing: 'unknown' });
  is('"unknown" is simply not written', 'payment_timing' in unknown.row, false);
  is('and is not reported as dropped', unknown.dropped, []);
}
{
  const symbol = commercialTerms({ currency: '€' });
  is('a symbol is not a currency', 'cost_currency' in symbol.row, false);
  is('and says so', symbol.dropped, ['currency']);
}

console.log('\n--- the failure that caused the damage ---');
{
  /*
    Every constrained field wrong at once, which is the worst case and the
    one the old code handled by losing all of it.
  */
  const { row, dropped } = commercialTerms({
    currency: 'USD',
    homepage_link_cost: 0,
    homepage_link_period: 'fortnightly',
    banner_cost: -5,
    banner_period: '',
    payment_timing: 'whenever',
    price_valid_until: '31/12/2026',
    notes: 'Pays on publication.',
  });
  is('the currency still lands', row.cost_currency, 'USD');
  is('and so do the notes', row.notes, 'Pays on publication.');
  is('every refused field is named', dropped.sort(), [
    'banner_cost',
    'banner_period',
    'homepage_link_cost',
    'homepage_link_period',
    'payment_timing',
    'price_valid_until',
  ]);
  is(
    'and none of them is in the row',
    Object.keys(row).sort(),
    ['cost_currency', 'notes'],
  );
}

console.log('\n--- a listing the model said nothing about ---');
{
  const { row, dropped } = commercialTerms({});
  is('writes no columns', Object.keys(row), []);
  is('and drops nothing, because nothing was answered', dropped, []);
}

console.log(failures === 0 ? '\n  all passed\n' : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
