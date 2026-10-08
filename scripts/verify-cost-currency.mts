/**
 * A cost is an amount and a currency, or it is not a cost.
 *
 * 410 listings held a figure for what we pay a publisher with no record of
 * which money it was. They were not from the publisher inbox - every one of
 * them had no `website_commercials` row at all - so they came through the
 * repository, where the cost and the currency were written by two
 * independent calls and nothing made them travel together.
 *
 * What is worth checking is the rule that now refuses that write, and
 * especially the cases it must NOT refuse: a listing whose currency is
 * already on record, and a write that touches no cost at all. A guard that
 * blocks ordinary edits gets turned off.
 *
 * No database, no network, no key.
 */

import {
  COST_CURRENCY_MESSAGE,
  costCurrencyBlocker,
  usableCurrency,
  writesACost,
} from '../src/lib/websites/cost-currency';

let failures = 0;
function is(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${what}${ok ? '' : ` - expected ${want}, got ${got}`}`);
}

console.log('\n--- what counts as a currency ---');
is('an ISO code', usableCurrency('EUR'), 'EUR');
is('lower case is a code too', usableCurrency('eur'), 'EUR');
// char(3) pads, and the padding is not part of the code.
is('padding is trimmed off', usableCurrency('GB '), null);
is('a padded three-letter code survives', usableCurrency(' usd '), 'USD');
/*
  The three that arrive from real publishers and all mean something.

  Storing them would move the problem rather than solve it: nothing can look
  up a rate for 'US$', and a column holding it reads as recorded when it is
  not.
*/
is('a symbol is not a code', usableCurrency('€'), null);
is('nor is a word', usableCurrency('Euro'), null);
is('nor is a symbol with letters', usableCurrency('US$'), null);
is('nor are digits', usableCurrency('123'), null);
is('blank is not a code', usableCurrency(''), null);
is('and neither is nothing at all', usableCurrency(null), null);
is('nor undefined', usableCurrency(undefined), null);

console.log('\n--- does this write put a cost on record ---');
is('a placement with a cost does', writesACost([{ costPriceMinor: 10_000 }]), true);
// Zero is a cost: it means the publisher gives it away, not that we do not know.
is('a cost of zero does too', writesACost([{ costPriceMinor: 0 }]), true);
is('a placement without one does not', writesACost([{}]), false);
is('nor does an empty list', writesACost([]), false);
is('nor does a patch that does not mention placements', writesACost(undefined), false);

console.log('\n--- when the write is refused ---');
is(
  'a cost with no currency anywhere is refused',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: undefined, recorded: null }),
  'no-currency',
);
is(
  'a cost with the currency in the same write is allowed',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: 'EUR', recorded: null }),
  null,
);
is(
  'a cost on a listing that already records one is allowed',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: undefined, recorded: 'USD' }),
  null,
);
/*
  The case that matters most for not being annoying.

  Editing the note, the turnaround or the price on a listing that has a cost
  must not be refused because the currency is missing - the refusal belongs to
  the write that records the cost, not to every write afterwards.
*/
is(
  'a write with no cost is never refused',
  costCurrencyBlocker({ services: [{}], supplied: undefined, recorded: null }),
  null,
);
is(
  'nor is one that touches no placements',
  costCurrencyBlocker({ services: undefined, supplied: undefined, recorded: null }),
  null,
);
is(
  'a symbol in place of a currency does not get through',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: '€', recorded: null }),
  'no-currency',
);
is(
  'nor does one already stored against the listing',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: undefined, recorded: 'Euro' }),
  'no-currency',
);
/*
  Clearing the currency while keeping the cost is the bug, deliberately.

  It is how a listing ends up holding a number with no unit, which is the
  state this whole rule exists to prevent.
*/
is(
  'a silent write on a listing that records one is still allowed',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: undefined, recorded: 'GBP' }),
  null,
);
is(
  'blanking the currency on a listing with costs is refused',
  costCurrencyBlocker({ services: [{ costPriceMinor: 12_000 }], supplied: '', recorded: 'GBP' }),
  'no-currency',
);

console.log('\n--- what it tells whoever is saving ---');
is('it names the field to fill', COST_CURRENCY_MESSAGE.includes('publisher currency'), true);
is('and says why it matters', COST_CURRENCY_MESSAGE.includes('converted'), true);

console.log(failures === 0 ? '\n  all passed\n' : `\n  ${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
