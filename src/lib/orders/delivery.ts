/**
 * What a customer may do with a placement we have handed back.
 *
 * Pure, and separate from the page that renders it, because these are the
 * rules of the deal rather than a layout: when a customer may still complain,
 * when silence becomes consent, and when an order is finished. Getting one of
 * them wrong does not throw - it quietly closes somebody's complaint or
 * quietly keeps their money in dispute.
 *
 * Every function takes `now` rather than reading the clock. A render that
 * reads the clock produces a different page depending on when React happened
 * to run, and a deadline that moves while you look at it is not a deadline.
 */

export interface DeliverableItem {
  /** Null until we hand it over. Not delivered is not awaiting approval. */
  deliveredAt?: string;
  /** Absent reads as 'pending': an item nobody has answered for. */
  approval?: 'pending' | 'approved' | 'issue-raised';
  approvedAt?: string;
  /** The deadline shown to the customer, fixed when we delivered. */
  autoApproveAt?: string;
  liveUrl?: string;
}

export type DeliveryState =
  /** Still ours. Nothing for the customer to do. */
  | 'not-delivered'
  | 'awaiting-approval'
  | 'approved'
  | 'issue-raised';

export function deliveryState(item: DeliverableItem): DeliveryState {
  if (!item.deliveredAt) return 'not-delivered';
  if (item.approval === 'approved') return 'approved';
  if (item.approval === 'issue-raised') return 'issue-raised';
  return 'awaiting-approval';
}

/**
 * Approving is for a delivery that has actually arrived.
 *
 * An item with an open issue is deliberately included: the usual ending of a
 * complaint is that we fix it and the customer is then happy, and making them
 * wait for us to close the issue first puts our admin in the way of their
 * approval.
 */
export function canApprove(item: DeliverableItem): boolean {
  if (!item.deliveredAt) return false;
  return item.approval !== 'approved';
}

/**
 * Reporting a problem stays open for a while after approval.
 *
 * Links get pulled, articles get edited, and a placement can go wrong weeks
 * after it went right. `postApprovalDays` is a setting because how long we
 * stand behind a placement is a commercial promise, not a constant.
 */
export function canReportIssue(
  item: DeliverableItem,
  postApprovalDays: number,
  now: Date,
): boolean {
  if (!item.deliveredAt) return false;
  if (item.approval !== 'approved') return true;
  if (!item.approvedAt) return false;

  const closesAt = Date.parse(item.approvedAt) + postApprovalDays * 86_400_000;
  return now.getTime() <= closesAt;
}

/** Whole days left before silence counts as consent, floored at zero. */
export function daysUntilAutoApproval(item: DeliverableItem, now: Date): number | null {
  if (deliveryState(item) !== 'awaiting-approval' || !item.autoApproveAt) return null;

  const remaining = Date.parse(item.autoApproveAt) - now.getTime();
  return Math.max(0, Math.ceil(remaining / 86_400_000));
}

/** Items the clock should approve, given nobody has. */
export function dueForAutoApproval<T extends DeliverableItem>(items: T[], now: Date): T[] {
  return items.filter(
    (item) =>
      deliveryState(item) === 'awaiting-approval' &&
      item.autoApproveAt != null &&
      Date.parse(item.autoApproveAt) <= now.getTime(),
  );
}

/**
 * When the whole order is finished.
 *
 * Every item approved, and there has to be at least one: an order with no
 * lines is not a completed order, it is an empty one. An open issue anywhere
 * keeps the order open however many of its siblings are settled.
 */
export function orderIsComplete(items: DeliverableItem[]): boolean {
  if (items.length === 0) return false;
  return items.every((item) => item.approval === 'approved');
}

/** Only the placements the customer still has to answer for. */
export function awaitingApproval<T extends DeliverableItem>(items: T[]): T[] {
  return items.filter((item) => deliveryState(item) === 'awaiting-approval');
}

/** Everything we have actually handed over, in any state. */
export function deliveredItems<T extends DeliverableItem>(items: T[]): T[] {
  return items.filter((item) => deliveryState(item) !== 'not-delivered');
}

/** The deadline we fix at the moment of handing over. */
export function autoApproveDate(deliveredAt: Date, windowDays: number): Date {
  return new Date(deliveredAt.getTime() + windowDays * 86_400_000);
}
