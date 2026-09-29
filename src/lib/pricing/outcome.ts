/**
 * What a pricing run actually did, in a sentence.
 *
 * The run already works out why a listing could not be priced - no currency
 * recorded against the publisher, or no FX rate for the one they quoted in -
 * and used to throw both away. The screen said "Repriced 2,431" and stopped,
 * which is fine until somebody is looking at a page of listings priced at
 * zero and trying to find out why. The two numbers that answer that question
 * were computed and discarded a function call earlier.
 *
 * Pure, so the wording can be checked without a database. That matters more
 * than it looks: this is the only place the failures surface at all.
 */

export interface ApplyOutcome {
  /** Placements priced, not listings - a listing has two or three. */
  priced: number;
  skippedOverrides: number;
  /** Currency codes with no rate. Nothing quoted in them can be priced. */
  missingRates: string[];
  /** Domains with no cost currency recorded against the publisher. */
  noCurrency: string[];
}

/** A few names, then a count, so a long list stays one line. */
function nameSome(items: string[], show = 4): string {
  const head = items.slice(0, show).join(', ');
  return items.length > show ? `${head} and ${items.length - show} more` : head;
}

export function applySummary(outcome: ApplyOutcome, verb = 'Repriced'): string {
  const { priced, skippedOverrides, missingRates, noCurrency } = outcome;

  // "Placements" rather than a bare number, because a listing has two or
  // three and the count being larger than the inventory reads as a bug.
  const parts = [
    `${verb} ${priced} ${priced === 1 ? 'placement' : 'placements'}.`,
  ];

  if (skippedOverrides > 0) {
    parts.push(
      `${skippedOverrides} left alone as ${skippedOverrides === 1 ? 'an override' : 'overrides'}.`,
    );
  }

  if (noCurrency.length > 0) {
    parts.push(
      `${noCurrency.length} ${noCurrency.length === 1 ? 'listing has' : 'listings have'} no cost currency recorded, so nothing could be converted: ${nameSome(noCurrency)}.`,
    );
  }

  if (missingRates.length > 0) {
    parts.push(
      `No exchange rate for ${nameSome(missingRates)} - anything quoted in ${missingRates.length === 1 ? 'it' : 'those'} was left unpriced.`,
    );
  }

  return parts.join(' ');
}
