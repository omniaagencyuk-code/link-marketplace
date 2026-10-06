/**
 * What a gap report costs, and whether it may run.
 *
 * Pure: facts in, a decision out. No network, no database - so the arithmetic
 * can be checked against the case that triggers it, which matters because the
 * number it produces is money.
 *
 * ## The pricing model, measured
 *
 * Against the live API rather than assumed:
 *
 *   units-cost-row   = the number of columns selected
 *   units-cost-total = max(50, rows x columns)
 *
 * One column selected is therefore one unit per referring domain, with a
 * fifty-unit floor per request. Two consequences shape everything here.
 *
 * **The bill is set by the competitor, and the customer picks the
 * competitor.** Three competitors with fifty thousand referring domains each
 * is 150,000 units from one form submission. So rows are capped per target
 * and the cap is what is budgeted against - not the competitor's real size,
 * which nobody knows before paying to find out.
 *
 * **The floor makes small calls wasteful.** A target with forty referring
 * domains costs the same fifty units as one with fifty. Not worth optimising,
 * but worth knowing before anybody proposes splitting a pull into pages.
 */

/** Charged per request however few rows come back. Measured, not documented. */
export const UNIT_FLOOR_PER_REQUEST = 50;

/**
 * One column, so one unit a row.
 *
 * `domain` is all a gap needs. Domain rating and traffic are another unit a
 * row each, and we already hold both for every site in our own inventory -
 * which is the only part of the gap we can sell. Buying metrics we have, for
 * domains we cannot offer, is the easiest way to triple this bill.
 */
export const COLUMNS_SELECTED = 1;

/** What one target's pull costs at a given row cap, worst case. */
export function costOfPull(rowCap: number): number {
  return Math.max(UNIT_FLOOR_PER_REQUEST, Math.max(0, rowCap) * COLUMNS_SELECTED);
}

/**
 * What a whole report costs, worst case.
 *
 * Worst case because every uncached target is assumed to hit the row cap. A
 * budget check that assumed the average would let a run start that cannot
 * finish, and a half-finished gap report is a bill with no product attached.
 */
export function costOfRun(uncachedTargets: number, rowCap: number): number {
  return Math.max(0, uncachedTargets) * costOfPull(rowCap);
}

export interface GapGuardInput {
  settings: {
    enabled: boolean;
    monthlyUnitBudget: number;
    unitSafetyPct: number;
    rowsPerTarget: number;
    runsPerAccount: number;
    maxCompetitors: number;
  };
  configured: boolean;
  /** Measured from the gap ledger. Never the refresh's number. */
  unitsUsedThisCycle: number;
  /** This account's runs this cycle. */
  runsThisCycle: number;
  /** Targets whose referring domains are not already cached and fresh. */
  uncachedTargets: number;
}

export type GapDecision =
  | { allowed: true; estimatedUnits: number; remaining: number; ceiling: number }
  | { allowed: false; reason: string; estimatedUnits: number; remaining: number; ceiling: number };

/**
 * May this report run?
 *
 * Separate from anything that wants to run it, for the reason the Hunter
 * guard is: the place that says no must not be the place that wants to say
 * yes.
 *
 * The order is cheapest refusal first, and each message says what the person
 * reading it can do - which for a customer means "you have used your five"
 * and never "the budget is spent", because our allowance is not their
 * problem and is not their business.
 */
export function mayRunGap(input: GapGuardInput): GapDecision {
  const { settings } = input;

  const budget = Math.max(0, settings.monthlyUnitBudget);
  const ceiling = Math.floor((budget * settings.unitSafetyPct) / 100);
  const remaining = Math.max(0, ceiling - input.unitsUsedThisCycle);
  const estimatedUnits = costOfRun(input.uncachedTargets, settings.rowsPerTarget);

  const refuse = (reason: string): GapDecision => ({
    allowed: false,
    reason,
    estimatedUnits,
    remaining,
    ceiling,
  });

  if (!settings.enabled) {
    return refuse('The gap finder is switched off at the moment.');
  }

  if (!input.configured) {
    return refuse('The gap finder is not set up on this deployment.');
  }

  /*
    The per-account limit before the budget.

    Deliberately: a customer who has used their allocation should be told
    that, not told the service is busy. The two refusals have different
    answers - wait for the cycle, or there is nothing you can do - and
    conflating them makes the first sound like the second.
  */
  if (settings.runsPerAccount > 0 && input.runsThisCycle >= settings.runsPerAccount) {
    return refuse(
      `You have run ${input.runsThisCycle} of your ${settings.runsPerAccount} reports this month. ` +
        `More become available when the month turns.`,
    );
  }

  if (budget === 0) {
    return refuse('The gap finder is not available at the moment.');
  }

  if (estimatedUnits > remaining) {
    /*
      Says nothing about our allowance.

      A customer being told "we have 1,200 Ahrefs units left" learns our
      cost base and can do nothing with it. They are told it is unavailable
      and when to come back, which is the whole of what concerns them.
    */
    return refuse('The gap finder is busy right now. Please try again later today.');
  }

  return { allowed: true, estimatedUnits, remaining, ceiling };
}

/**
 * The same question for an admin, who is entitled to the numbers.
 *
 * The customer-facing refusal above is deliberately vague about our budget;
 * this is what the admin page shows, where vagueness would be unhelpful
 * rather than discreet.
 */
export function describeForAdmin(decision: GapDecision): string {
  if (decision.allowed) {
    return `Would spend about ${decision.estimatedUnits.toLocaleString('en-GB')} units, with ${decision.remaining.toLocaleString('en-GB')} left before the guard at ${decision.ceiling.toLocaleString('en-GB')}.`;
  }

  return `${decision.reason} Estimated ${decision.estimatedUnits.toLocaleString('en-GB')} units against ${decision.remaining.toLocaleString('en-GB')} remaining.`;
}

/**
 * Is a cached pull still usable?
 *
 * A referring-domain set a month old is a better answer than a bill. The
 * comparison is against the fetch time rather than a stored expiry, so
 * shortening the window in settings takes effect on the next request instead
 * of only on rows written afterwards.
 */
export function isFresh(fetchedAt: string, cacheDays: number, now = Date.now()): boolean {
  const fetched = new Date(fetchedAt).getTime();
  if (!Number.isFinite(fetched)) return false;
  return now - fetched < Math.max(0, cacheDays) * 24 * 60 * 60 * 1000;
}
