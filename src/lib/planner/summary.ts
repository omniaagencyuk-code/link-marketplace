import type { PlannerLink, PlannerStatus, StatusCategory } from '@/lib/types/planner';

/**
 * What a month adds up to.
 *
 * Pure, and in its own file, so the arithmetic can be checked without a
 * database or a browser. Every number on the overview comes from here, and
 * each one has a definition that has to survive somebody asking "where did
 * that come from" six months from now.
 */

type SummaryRow = Pick<
  PlannerLink,
  'statusId' | 'linkType' | 'anchorType' | 'priceMinor' | 'currency' | 'paymentStatus' | 'paidMinor'
>;

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
function slices(values: string[]): Slice[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const label = raw.trim() || 'Not set';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = values.length;
  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summariseMonth(
  rows: SummaryRow[],
  statuses: PlannerStatus[],
  options: { target: number | null; budgetMinor: number | null; currency: string },
): MonthSummary {
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));

  const byCategory = { ...EMPTY_CATEGORIES };
  let paidMinor = 0;
  let committedMinor = 0;
  const otherCurrencies = new Map<string, number>();

  for (const row of rows) {
    const category = categoryOf.get(row.statusId) ?? 'planned';
    byCategory[category] += 1;

    /*
      Only the project's own currency is totalled.

      A row priced in euros is a real cost and it is not addable to a pound
      figure without a rate we do not have. It is counted apart and named,
      so the budget is honest about what it is not covering rather than
      quietly leaving it out.
    */
    const currency = row.currency ?? options.currency;
    if (currency !== options.currency) {
      otherCurrencies.set(currency, (otherCurrencies.get(currency) ?? 0) + 1);
      continue;
    }

    const price = row.priceMinor ?? 0;
    const paid =
      row.paymentStatus === 'paid'
        ? price
        : row.paymentStatus === 'partially_paid'
          ? (row.paidMinor ?? 0)
          : 0;

    paidMinor += paid;

    // Work that is no longer happening costs nothing more.
    if (category !== 'cancelled' && category !== 'lost') {
      committedMinor += Math.max(0, price - paid);
    }
  }

  const target = options.target;
  const live = byCategory.live;

  return {
    total: rows.length,
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
    linkTypes: slices(rows.map((row) => row.linkType)),
    anchorTypes: slices(rows.map((row) => row.anchorType)),
    otherCurrencies: [...otherCurrencies.entries()]
      .map(([currency, count]) => ({ currency, count }))
      .sort((a, b) => b.count - a.count),
  };
}
