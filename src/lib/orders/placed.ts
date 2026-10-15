import { formatPrice } from '@/lib/utils/format';
import type { Order } from '@/lib/types';

/**
 * Did this order actually get placed?
 *
 * An order row is written *before* the customer is sent to Stripe, so the
 * table holds two different things that look alike: orders somebody paid
 * for, and the remains of a checkout somebody opened and walked away from.
 * Both are real rows and neither should be deleted - the abandoned one is
 * how a payment that arrives late still has an order to attach itself to.
 *
 * But only one of them is an order the customer placed, and listing them
 * together under "Submitted orders" tells somebody they bought four things
 * when they bought one.
 *
 * ## The rule, and why it is phrased from the payment
 *
 * Paid, or moved past draft by something that has already decided it was
 * paid. `markOrderPaid` does both in one go - it sets `paid` and moves the
 * status to `awaiting-content` - so either half on its own is enough, and
 * the gap between them is the second or two before the webhook lands. A
 * customer refreshing in that window sees their order where they expect it
 * rather than filed under the ones they abandoned.
 *
 * A cancelled order counts as placed. It was bought and then withdrawn,
 * which is part of somebody's order history and not the same event as never
 * having paid.
 */
export function isPlaced(order: Pick<Order, 'status' | 'paymentStatus'>): boolean {
  return order.paymentStatus === 'paid' || order.status !== 'draft';
}

export interface SplitOrders<T> {
  /** Bought: paid, in progress, delivered, or cancelled after the fact. */
  placed: T[];
  /** Checkout opened and left. Nothing was charged. */
  abandoned: T[];
}

/** The same list, in the two groups the customer reads differently. */
export function splitOrders<T extends Pick<Order, 'status' | 'paymentStatus'>>(
  orders: T[],
): SplitOrders<T> {
  return {
    placed: orders.filter((order) => isPlaced(order)),
    abandoned: orders.filter((order) => !isPlaced(order)),
  };
}

/**
 * What the card was charged, where that is not what the row already says.
 *
 * Silent when nothing was paid - the status column says "Not paid yet" and
 * saying it twice helps nobody - and silent when the charge is the price,
 * which is every order with no VAT on it and one placement in it. A line
 * that appears only when it has something to add is a line people read.
 */
export function chargedNote(order: Order, priceMinor: number): string | null {
  if (order.paymentStatus !== 'paid' || order.chargedMinor == null) return null;

  const charged = formatPrice(order.chargedMinor, { currency: order.currency });

  // Several placements on one payment: no row equals the charge, so the
  // figure is named as the whole rather than implied to be this line's.
  if (order.items.length > 1) return `part of ${charged} charged`;
  return order.chargedMinor === priceMinor ? null : `${charged} charged`;
}
