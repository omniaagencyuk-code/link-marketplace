import type { SalesSettings } from '@/lib/types/sales';

/**
 * Whether a Hunter lookup may happen.
 *
 * Pure, and separate from both the client and the service, for one reason: the
 * place that says no must not be the place that wants to say yes. A client
 * that checks its own budget is a client that has to be trusted to check it,
 * and this is the only function in the feature whose whole job is refusing.
 *
 * ## The order the checks are in is the design
 *
 * Off before dry run, dry run before configured, configured before budget.
 * Each refusal is cheaper than the one after it, and the message says which
 * switch to change rather than "not allowed" - because the person reading it
 * is trying to make it work, not trying to understand why it does not.
 *
 * ## Zero means no
 *
 * The budget ships at zero and zero refuses everything. That is not a
 * conservative default dressed up as a safety feature: a credit allowance
 * nobody has entered is an allowance nobody has agreed to spend, and the only
 * reading of it that cannot cost money by accident is a refusal.
 */

export interface GuardInput {
  settings: Pick<
    SalesSettings,
    'enabled' | 'dryRun' | 'hunterMonthlyCreditBudget' | 'hunterCreditSafetyPct'
  >;
  configured: boolean;
  /** Measured from the ledger, never estimated. */
  creditsUsedThisCycle: number;
  /** What this call would cost. One, for a domain search. */
  cost: number;
}

export type GuardDecision =
  | { allowed: true; ceiling: number; remaining: number }
  | { allowed: false; reason: string; ceiling: number; remaining: number };

export function mayLookUp(input: GuardInput): GuardDecision {
  const { settings } = input;
  const budget = Math.max(0, settings.hunterMonthlyCreditBudget);
  const ceiling = Math.floor((budget * settings.hunterCreditSafetyPct) / 100);
  const remaining = Math.max(0, ceiling - input.creditsUsedThisCycle);
  const refuse = (reason: string): GuardDecision => ({ allowed: false, reason, ceiling, remaining });

  if (!settings.enabled) {
    return refuse('The Sales Centre is off. Turn it on in Sales settings first.');
  }

  if (settings.dryRun) {
    return refuse(
      'Dry run is on, so no Hunter credit will be spent. Turn dry run off to look up real contacts.',
    );
  }

  if (!input.configured) {
    return refuse('HUNTER_API_KEY is not set. Add it in Vercel and redeploy.');
  }

  if (budget === 0) {
    return refuse(
      'The Hunter credit budget is zero, so every lookup is refused. Set a monthly budget in ' +
        'Sales settings - it ships at zero on purpose, because a budget nobody has entered is ' +
        'one nobody has agreed to spend.',
    );
  }

  if (input.cost > remaining) {
    return refuse(
      `That would spend ${input.cost} credit${input.cost === 1 ? '' : 's'} against ` +
        `${remaining} left before the guard at ${ceiling.toLocaleString('en-GB')} ` +
        `(${settings.hunterCreditSafetyPct}% of ${budget.toLocaleString('en-GB')}). ` +
        `Raise the budget, or wait for the cycle to reset.`,
    );
  }

  return { allowed: true, ceiling, remaining };
}

/**
 * How many lookups a sweep may make before it must stop.
 *
 * The sweep asks once, up front, rather than asking the guard per prospect and
 * discovering halfway through that it cannot finish: a run that stops in the
 * middle leaves half its prospects marked `running`, and the next run has to
 * work out which half.
 */
export function lookupsAffordable(input: Omit<GuardInput, 'cost'>): number {
  const decision = mayLookUp({ ...input, cost: 1 });
  if (!decision.allowed) return 0;
  return decision.remaining;
}
