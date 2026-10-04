/**
 * Whether a code applies, and what it takes off.
 *
 * Pure: codes and counts in, a verdict out. Nothing here reads a database, a
 * clock or Stripe, which is what lets every rule be checked by calling a
 * function - and these are the rules standing between a code somebody posted
 * on a deals forum and an unbounded discount, so they are worth being able to
 * test exhaustively.
 */

export type PromoKind = 'percent' | 'fixed';

export interface PromoCode {
  id: string;
  code: string;
  description: string;
  kind: PromoKind;
  percentOff?: number;
  amountOffMinor?: number;
  currency?: string;
  startsAt?: string;
  expiresAt?: string;
  maxRedemptions?: number;
  maxPerCustomer?: number;
  minOrderMinor?: number;
  firstOrderOnly: boolean;
  active: boolean;
  /** Null until Stripe has been told about it. Checkout refuses such a code. */
  stripeCouponId?: string;
  createdAt: string;
}

/** What the caller has to look up before a verdict can be given. */
export interface PromoContext {
  /** The order before any discount, in minor units. */
  subtotalMinor: number;
  /** The currency the order will be charged in. */
  currency: string;
  now: Date;
  /** Paid redemptions of this code, by anybody. */
  totalRedemptions: number;
  /** Paid redemptions of this code by this buyer. */
  customerRedemptions: number;
  /** Has this buyer ever paid for an order before? */
  customerHasPaidOrder: boolean;
}

export interface PromoAccepted {
  ok: true;
  discountMinor: number;
  /** What is left to charge. Zero means the code covers the whole order. */
  payableMinor: number;
}

export interface PromoRefused {
  ok: false;
  /** Shown to the buyer as typed. Written to be read by somebody shopping. */
  reason: string;
}

export type PromoVerdict = PromoAccepted | PromoRefused;

/**
 * A code as it is stored and compared.
 *
 * Upper case with every space removed, because people paste codes out of
 * emails with a trailing space and type them in whatever case they like. The
 * column stores the normalised form, so this is the only spelling that exists.
 */
export function normaliseCode(raw: string): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40);
}

/**
 * Stripe will not take a payment below this.
 *
 * Thirty pence is the real floor for GBP; a pound is used because the gap
 * between them is not worth a second rule, and a code landing in it is
 * vanishingly rare. A remainder under this is given away rather than refused:
 * erroring at Stripe over 40p, after the buyer has already been told the code
 * worked, is the worse outcome by a distance.
 */
const MINIMUM_CHARGE_MINOR = 100;

/** What this code takes off that subtotal, never more than the subtotal. */
export function discountFor(code: PromoCode, subtotalMinor: number): number {
  if (subtotalMinor <= 0) return 0;

  if (code.kind === 'percent') {
    const percent = code.percentOff ?? 0;
    // Rounded rather than floored, so a 25% code on £29.99 takes off £7.50
    // and not £7.49. Stripe rounds the same way on its own coupons.
    return Math.min(subtotalMinor, Math.round((subtotalMinor * percent) / 100));
  }

  // A fixed amount larger than the order takes the order to zero rather than
  // going negative. The remainder of the code is not carried anywhere: this
  // is a discount, not a balance.
  return Math.min(subtotalMinor, code.amountOffMinor ?? 0);
}

function formatted(minor: number, currency: string): string {
  const symbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  const amount = (minor / 100).toFixed(2).replace(/\.00$/, '');
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}

/**
 * The verdict on one code for one basket.
 *
 * Ordered so the buyer is told the most useful thing first. "Spend £50 to use
 * this" is actionable; "this code is not for you" is not, so the rules that
 * cannot be fixed by changing the basket come last.
 */
export function validatePromo(
  code: PromoCode | null,
  context: PromoContext,
): PromoVerdict {
  if (!code || !code.active) {
    // The same answer for a code that does not exist and one that has been
    // switched off. Neither is a hint worth giving, and both are equally
    // useless to the person typing.
    return { ok: false, reason: 'That code is not valid.' };
  }

  /*
    A code Stripe has never heard of.

    The coupon is created alongside the code, so this only happens when that
    call failed - Stripe down, or keys missing at the time. Refusing is the
    only safe answer: accepting would show the buyer a discount, hand Stripe a
    session with no coupon on it, and charge them full price.
  */
  if (!code.stripeCouponId) {
    return { ok: false, reason: 'That code is not ready to use yet. Please try again later.' };
  }

  if (code.startsAt && new Date(code.startsAt).getTime() > context.now.getTime()) {
    return { ok: false, reason: 'That code is not active yet.' };
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() <= context.now.getTime()) {
    return { ok: false, reason: 'That code has expired.' };
  }

  // A fixed amount in the wrong currency is not a conversion problem to solve
  // - Stripe refuses such a coupon outright, so it is refused here where the
  // message can say something useful.
  if (code.kind === 'fixed' && code.currency && code.currency !== context.currency) {
    return { ok: false, reason: `That code can only be used on orders in ${code.currency}.` };
  }

  if (code.minOrderMinor && context.subtotalMinor < code.minOrderMinor) {
    return {
      ok: false,
      reason: `That code needs an order of ${formatted(code.minOrderMinor, context.currency)} or more.`,
    };
  }

  if (code.maxRedemptions != null && context.totalRedemptions >= code.maxRedemptions) {
    return { ok: false, reason: 'That code has been fully used.' };
  }

  if (code.maxPerCustomer != null && context.customerRedemptions >= code.maxPerCustomer) {
    return {
      ok: false,
      reason:
        code.maxPerCustomer === 1
          ? 'You have already used that code.'
          : 'You have used that code as many times as it allows.',
    };
  }

  if (code.firstOrderOnly && context.customerHasPaidOrder) {
    return { ok: false, reason: 'That code is for first orders only.' };
  }

  const discountMinor = discountFor(code, context.subtotalMinor);
  if (discountMinor <= 0) {
    return { ok: false, reason: 'That code takes nothing off this order.' };
  }

  const remainder = context.subtotalMinor - discountMinor;

  return {
    ok: true,
    discountMinor: remainder < MINIMUM_CHARGE_MINOR ? context.subtotalMinor : discountMinor,
    payableMinor: remainder < MINIMUM_CHARGE_MINOR ? 0 : remainder,
  };
}

/** How the discount reads in the basket and on the order. */
export function promoSummary(code: PromoCode): string {
  return code.kind === 'percent'
    ? `${code.percentOff}% off`
    : `${formatted(code.amountOffMinor ?? 0, code.currency ?? 'GBP')} off`;
}
