/**
 * Prove the promo code rules refuse what they should.
 *
 * No database and no network: the rules are pure, so every one of them can be
 * checked by calling a function. Worth doing exhaustively, because these are
 * the rules standing between a code somebody posted on a deals forum and an
 * unbounded discount - and none of them fail loudly. A limit that is off by
 * one does not throw, it just gives away money.
 */
import {
  discountFor,
  normaliseCode,
  promoSummary,
  validatePromo,
  type PromoCode,
  type PromoContext,
} from '../src/lib/promos/rules';

let failed = 0;
const ok = (l: string) => console.log(`  PASS  ${l}`);
const bad = (l: string) => {
  console.log(`  FAIL  ${l}`);
  failed += 1;
};
const yes = (l: string, condition: boolean) => (condition ? ok(l) : bad(l));
const is = <T,>(l: string, actual: T, expected: T) =>
  actual === expected ? ok(l) : bad(`${l} (got ${String(actual)}, wanted ${String(expected)})`);

const NOW = new Date('2026-06-15T12:00:00.000Z');

function percentCode(over: Partial<PromoCode> = {}): PromoCode {
  return {
    id: 'p1',
    code: 'SPRING25',
    description: '',
    kind: 'percent',
    percentOff: 25,
    firstOrderOnly: false,
    active: true,
    stripeCouponId: 'co_test',
    createdAt: NOW.toISOString(),
    ...over,
  };
}

function fixedCode(over: Partial<PromoCode> = {}): PromoCode {
  return {
    id: 'p2',
    code: 'FIFTYOFF',
    description: '',
    kind: 'fixed',
    amountOffMinor: 5000,
    currency: 'GBP',
    firstOrderOnly: false,
    active: true,
    stripeCouponId: 'co_test2',
    createdAt: NOW.toISOString(),
    ...over,
  };
}

function context(over: Partial<PromoContext> = {}): PromoContext {
  return {
    subtotalMinor: 40000,
    currency: 'GBP',
    now: NOW,
    totalRedemptions: 0,
    customerRedemptions: 0,
    customerHasPaidOrder: false,
    ...over,
  };
}

/** The reason on a refusal, or '(accepted)' when it was allowed. */
function refusal(code: PromoCode | null, ctx: PromoContext): string {
  const verdict = validatePromo(code, ctx);
  return verdict.ok ? '(accepted)' : verdict.reason;
}

console.log('\n--- how a code is spelled ---');
is('spaces go', normaliseCode(' spring 25 '), 'SPRING25');
is('case goes', normaliseCode('spring25'), 'SPRING25');
is('a tab is a space', normaliseCode('SPRING\t25'), 'SPRING25');
is('nothing stays nothing', normaliseCode(''), '');
is('a silly length is cut', normaliseCode('A'.repeat(200)).length, 40);

console.log('\n--- what a code takes off ---');
is('25% of £400 is £100', discountFor(percentCode(), 40000), 10000);
is('rounded, not floored', discountFor(percentCode(), 2999), 750);
is('a fixed amount is itself', discountFor(fixedCode(), 40000), 5000);
is(
  'a fixed amount larger than the order stops at the order',
  discountFor(fixedCode({ amountOffMinor: 100000 }), 40000),
  40000,
);
is('nothing off nothing', discountFor(percentCode(), 0), 0);
is('100% is the whole order', discountFor(percentCode({ percentOff: 100 }), 40000), 40000);

console.log('\n--- the rules that refuse ---');
is('a code that does not exist', refusal(null, context()), 'That code is not valid.');
is(
  'a code switched off reads the same as one that does not exist',
  refusal(percentCode({ active: false }), context()),
  'That code is not valid.',
);
is(
  'a code Stripe has never heard of is refused, not charged at full price',
  refusal(percentCode({ stripeCouponId: undefined }), context()),
  'That code is not ready to use yet. Please try again later.',
);
is(
  'before it starts',
  refusal(percentCode({ startsAt: '2026-07-01T00:00:00.000Z' }), context()),
  'That code is not active yet.',
);
is(
  'after it expires',
  refusal(percentCode({ expiresAt: '2026-06-01T00:00:00.000Z' }), context()),
  'That code has expired.',
);
yes(
  'expiring later today still works',
  validatePromo(percentCode({ expiresAt: '2026-06-15T23:59:59.999Z' }), context()).ok,
);
is(
  'expiring at this exact moment does not',
  refusal(percentCode({ expiresAt: NOW.toISOString() }), context()),
  'That code has expired.',
);
is(
  'a fixed code in the wrong currency',
  refusal(fixedCode(), context({ currency: 'USD' })),
  'That code can only be used on orders in GBP.',
);
yes(
  'a percentage does not care about the currency',
  validatePromo(percentCode(), context({ currency: 'USD' })).ok,
);
is(
  'under the minimum order',
  refusal(percentCode({ minOrderMinor: 50000 }), context({ subtotalMinor: 40000 })),
  'That code needs an order of £500 or more.',
);
yes(
  'exactly the minimum is enough',
  validatePromo(percentCode({ minOrderMinor: 40000 }), context({ subtotalMinor: 40000 })).ok,
);
is(
  'used up across everybody',
  refusal(percentCode({ maxRedemptions: 50 }), context({ totalRedemptions: 50 })),
  'That code has been fully used.',
);
yes(
  'one left is still one',
  validatePromo(percentCode({ maxRedemptions: 50 }), context({ totalRedemptions: 49 })).ok,
);
is(
  'already used by this customer',
  refusal(percentCode({ maxPerCustomer: 1 }), context({ customerRedemptions: 1 })),
  'You have already used that code.',
);
is(
  'and the plural reads properly',
  refusal(percentCode({ maxPerCustomer: 3 }), context({ customerRedemptions: 3 })),
  'You have used that code as many times as it allows.',
);
is(
  'first orders only, and they have ordered before',
  refusal(percentCode({ firstOrderOnly: true }), context({ customerHasPaidOrder: true })),
  'That code is for first orders only.',
);
yes(
  'first orders only, and this is their first',
  validatePromo(percentCode({ firstOrderOnly: true }), context({ customerHasPaidOrder: false })).ok,
);

/*
  No limit means no limit. The admin form leaves these boxes empty and the
  action turns an empty box into undefined - a zero here would be a code
  nobody can ever use, created by somebody who thought they were leaving it
  unlimited.
*/
console.log('\n--- an empty limit is not a zero limit ---');
yes(
  'no total limit allows the thousandth redemption',
  validatePromo(percentCode(), context({ totalRedemptions: 999 })).ok,
);
yes(
  'no per-customer limit allows a repeat',
  validatePromo(percentCode(), context({ customerRedemptions: 9 })).ok,
);
yes('no minimum allows a small order', validatePromo(percentCode(), context({ subtotalMinor: 500 })).ok);

console.log('\n--- what is left to charge ---');
{
  const verdict = validatePromo(percentCode(), context({ subtotalMinor: 40000 }));
  if (!verdict.ok) bad('25% off £400 should be accepted');
  else {
    is('takes off £100', verdict.discountMinor, 10000);
    is('leaves £300 to pay', verdict.payableMinor, 30000);
  }
}
{
  // A code that covers the whole order never reaches Stripe: a session for a
  // zero total is rejected outright, so checkout settles the order itself.
  const verdict = validatePromo(percentCode({ percentOff: 100 }), context({ subtotalMinor: 40000 }));
  if (!verdict.ok) bad('100% off should be accepted');
  else {
    is('a 100% code takes the whole order', verdict.discountMinor, 40000);
    is('and leaves nothing to pay', verdict.payableMinor, 0);
  }
}
{
  /*
    The awkward middle. Stripe will not take a payment of a few pence, so a
    fixed code leaving less than its floor gives the remainder away rather
    than erroring at Stripe after the buyer was told the code worked.
  */
  const verdict = validatePromo(
    fixedCode({ amountOffMinor: 9960 }),
    context({ subtotalMinor: 10000 }),
  );
  if (!verdict.ok) bad('a near-total fixed discount should be accepted');
  else {
    is('a 40p remainder is given away', verdict.payableMinor, 0);
    is('and the discount covers the lot', verdict.discountMinor, 10000);
  }
}
{
  const verdict = validatePromo(fixedCode({ amountOffMinor: 9000 }), context({ subtotalMinor: 10000 }));
  if (!verdict.ok) bad('a £90 discount on £100 should be accepted');
  else is('a £10 remainder is charged normally', verdict.payableMinor, 1000);
}
is(
  'a code worth nothing on this order is refused rather than applied',
  refusal(fixedCode({ amountOffMinor: 5000 }), context({ subtotalMinor: 0 })),
  'That code takes nothing off this order.',
);

console.log('\n--- how it reads ---');
is('a percentage', promoSummary(percentCode()), '25% off');
is('a fixed amount', promoSummary(fixedCode()), '£50 off');
is('a fixed amount in dollars', promoSummary(fixedCode({ currency: 'USD' })), '$50 off');
is('a fixed amount with pence', promoSummary(fixedCode({ amountOffMinor: 4950 })), '£49.50 off');

console.log(failed === 0 ? '\n  all passed\n' : `\n  ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
