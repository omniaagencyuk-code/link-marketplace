/**
 * A cost is an amount and a currency, or it is not a cost.
 *
 * `service_costs` holds what we pay a publisher; `website_commercials`
 * holds which money that is. They are separate tables for a good reason -
 * one is per placement and the other is per publisher - and they were
 * written by two independent calls, with nothing requiring them to travel
 * together. `syncCostCurrency` returns early when a patch does not mention
 * a currency, so a write carrying a cost and no currency saved the number
 * and never the unit.
 *
 * That produced 410 listings holding a figure nobody can use. Not a small
 * number and not a visible one: the engine cannot convert them, so it
 * cannot price them, so they sit as drafts that will never publish - and
 * nothing anywhere said why. The table printed "cost in an unrecorded
 * currency" to whoever happened to scroll past.
 *
 * Guessing is not available. A `.fr` domain quoting 120 may well be quoting
 * dollars, and a guess here becomes a margin we price against and a figure
 * we would have to honour. The rule the repository already states for
 * publishers' own numbers applies to ours.
 *
 * So the write refuses instead. Pure, and separate from the repository, so
 * the rule can be checked without a database.
 */

/** A placement, as far as this rule is concerned. */
export interface CostBearing {
  costPriceMinor?: number;
}

/** Does this write put a cost on record? */
export function writesACost(services: readonly CostBearing[] | undefined): boolean {
  return (services ?? []).some((service) => typeof service.costPriceMinor === 'number');
}

/**
 * The currency, if it is one we could actually convert from.
 *
 * `char(3)` comes back padded, and anything that is not three letters after
 * trimming is not a code - 'US$', 'Euro' and '€' all arrive here and all of
 * them meant something, but none of them is an ISO code and storing them
 * would only move the problem.
 */
export function usableCurrency(code: string | null | undefined): string | null {
  const trimmed = (code ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : null;
}

/**
 * Whether a write may go ahead.
 *
 * The two cases are not the same, and the first draft of this treated them
 * as one. A write that does not mention the currency leaves whatever is on
 * record, so the listing's own code decides. A write that mentions it and
 * gives something unusable *clears* it - that is what `syncCostCurrency`
 * does with a blank - so the stored code is about to stop existing and
 * cannot be what makes the write acceptable.
 *
 * Blanking the currency while keeping the cost is precisely the state all of
 * this exists to prevent, and falling back to the stored value would have
 * allowed it.
 */
export function costCurrencyBlocker(args: {
  services: readonly CostBearing[] | undefined;
  /** The currency in this write. `undefined` means the write is silent about it. */
  supplied: string | null | undefined;
  /** The currency already against the listing, for a write that is silent. */
  recorded: string | null | undefined;
}): 'no-currency' | null {
  if (!writesACost(args.services)) return null;

  if (args.supplied !== undefined) {
    return usableCurrency(args.supplied) ? null : 'no-currency';
  }

  return usableCurrency(args.recorded) ? null : 'no-currency';
}

/**
 * Said to whoever is saving, which is usually a person at a form.
 *
 * It names the fix rather than the rule. "Invalid currency" sends somebody
 * looking for a field they already left blank on purpose.
 */
export const COST_CURRENCY_MESSAGE =
  'This listing records what we pay the publisher but not which currency they quote in, ' +
  'so the cost cannot be converted or priced. Set the publisher currency on the listing, ' +
  'then save the cost.';
