import type { PaymentStatus, StatusCategory } from '@/lib/types/planner';

/**
 * What a plan adds up to.
 *
 * Pure, and in its own file, so the arithmetic can be checked without a
 * database or a browser. Every number on the overview and in the reports
 * comes from here, and each one has a definition that has to survive
 * somebody asking "where did that come from" six months from now.
 *
 * ## It counts groups, not links
 *
 * The database does the grouping (`planner_report_rows`, 0083) and this
 * does the arithmetic. Reading every row of a project to add it up in
 * JavaScript works until it silently stops: PostgREST caps a response at a
 * thousand rows and says nothing in the response about it, so the figure
 * an agency takes to a client meeting would just be short.
 *
 * What stayed here is what "paid" and "committed" mean. There is exactly
 * one copy of those rules, and it is this file - a second one in SQL would
 * drift, and the copy that drifted would be the one somebody budgets
 * against.
 */

/** The dimensions the database groups by. */
export type PlannerDimension = 'month' | 'source' | 'linkType' | 'anchorType' | 'status';

/**
 * One combination that exists in a plan, counted.
 *
 * The key is the dimension's bucket plus the three things the money rules
 * need to look at - the status's category, the payment status and the
 * currency - so the rules below can be applied to a group exactly as they
 * would be applied to each row in it.
 */
export interface PlannerGroup {
  dimension: PlannerDimension;
  /** The month, source, type, anchor type or status id this counts. */
  bucket: string;
  category: StatusCategory;
  paymentStatus: PaymentStatus;
  /** Null means the project's own currency, as it does on the row. */
  currency: string | null;
  count: number;
  /** Sum of the prices, a blank price counting as nothing. */
  priceSum: number;
  /** Sum of what has actually been paid against them. */
  paidSum: number;
  /** Sum of `max(0, price - paid)`, clamped per row before summing. */
  owingSum: number;
}

/**
 * What a group is worth, by the two definitions everything else uses.
 *
 * `paid` is money that has left: the full price of anything marked paid,
 * plus the part-payment recorded against anything partly paid. Deliberately
 * not "anything Live" - a link can go live before the invoice does, and
 * counting it as spent tells somebody they have less left than they do.
 *
 * `committed` is priced work still to be paid for. Work that is no longer
 * happening costs nothing more, so a cancelled or lost row commits nothing.
 */
export function moneyOf(group: PlannerGroup): { paid: number; committed: number } {
  const paid = group.paidSum;
  const committed =
    group.category === 'cancelled' || group.category === 'lost' ? 0 : group.owingSum;
  return { paid, committed };
}

/** Is this group priced in something the project cannot total? */
export function isForeign(group: PlannerGroup, currency: string): boolean {
  return (group.currency ?? currency) !== currency;
}

export interface Slice {
  label: string;
  count: number;
  /** 0-100, rounded. Shown beside the label, never instead of it. */
  share: number;
}

export interface MonthSummary {
  total: number;
  byCategory: Record<StatusCategory, number>;

  /** Null when no target is set - which is not the same as a target of zero. */
  target: number | null;
  /** Null whenever `target` is, so the ring draws counts and no percentage. */
  progress: number | null;

  budgetMinor: number | null;
  /**
   * Money that has actually left: the full price of anything marked paid,
   * plus the part-payment recorded against anything partly paid.
   *
   * Deliberately not "anything Live". A link can go live before the invoice
   * does, and counting it as spent is how a budget report tells somebody
   * they have less left than they do.
   */
  paidMinor: number;
  /**
   * Priced work that is still going to be paid for: everything not
   * cancelled or lost, less what has already been paid against it.
   */
  committedMinor: number;
  /** Budget less paid and committed. Null without a budget. */
  remainingMinor: number | null;
  /** Budget less only what has actually been paid. Null without a budget. */
  remainingAfterPaidMinor: number | null;

  linkTypes: Slice[];
  anchorTypes: Slice[];

  /**
   * Links priced in something other than the project's currency.
   *
   * Counted and named, never converted. There is no exchange-rate source
   * here, and a rate fetched today applied to an invoice paid in March is a
   * figure that looks precise and is not.
   */
  otherCurrencies: { currency: string; count: number }[];
}

const EMPTY_CATEGORIES: Record<StatusCategory, number> = {
  planned: 0,
  in_progress: 0,
  scheduled: 0,
  waiting: 0,
  live: 0,
  lost: 0,
  cancelled: 0,
};

/** Grouped, biggest first, with anything unlabelled gathered as "Not set". */
export function slices(groups: PlannerGroup[], dimension: PlannerDimension): Slice[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const group of groups) {
    if (group.dimension !== dimension) continue;
    const label = group.bucket.trim() || 'Not set';
    counts.set(label, (counts.get(label) ?? 0) + group.count);
    total += group.count;
  }
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summariseMonth(
  groups: PlannerGroup[],
  options: { target: number | null; budgetMinor: number | null; currency: string },
): MonthSummary {
  const byCategory = { ...EMPTY_CATEGORIES };
  let total = 0;
  let paidMinor = 0;
  let committedMinor = 0;
  const otherCurrencies = new Map<string, number>();

  /*
    The status dimension is the one counted, because every link appears in
    it exactly once. Totalling across dimensions would count each link five
    times, which is the one way to get this wrong and the reason the
    dimension is named here rather than assumed.
  */
  for (const group of groups) {
    if (group.dimension !== 'status') continue;
    total += group.count;
    byCategory[group.category] += group.count;

    /*
      Only the project's own currency is totalled.

      A row priced in euros is a real cost and it is not addable to a pound
      figure without a rate we do not have. It is counted apart and named,
      so the budget is honest about what it is not covering rather than
      quietly leaving it out.
    */
    if (isForeign(group, options.currency)) {
      const currency = group.currency ?? options.currency;
      otherCurrencies.set(currency, (otherCurrencies.get(currency) ?? 0) + group.count);
      continue;
    }

    const money = moneyOf(group);
    paidMinor += money.paid;
    committedMinor += money.committed;
  }

  const target = options.target;
  const live = byCategory.live;

  return {
    total,
    byCategory,
    target,
    /*
      Absent, not zero, when nobody set a target.

      A ring reading 0% against a target nobody chose says somebody is
      failing at something they never agreed to.
    */
    progress: target === null || target === 0 ? null : Math.round((live / target) * 100),
    budgetMinor: options.budgetMinor,
    paidMinor,
    committedMinor,
    remainingMinor:
      options.budgetMinor === null ? null : options.budgetMinor - paidMinor - committedMinor,
    remainingAfterPaidMinor:
      options.budgetMinor === null ? null : options.budgetMinor - paidMinor,
    linkTypes: slices(groups, 'linkType'),
    anchorTypes: slices(groups, 'anchorType'),
    otherCurrencies: [...otherCurrencies.entries()]
      .map(([currency, count]) => ({ currency, count }))
      .sort((a, b) => b.count - a.count),
  };
}
