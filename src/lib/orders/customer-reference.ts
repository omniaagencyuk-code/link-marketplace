/**
 * The customer's own label for an order, cleaned.
 *
 * An agency has one Press Parrot login and gives it to its team. `reference`
 * is ours - LM-10428 - so when five people order through one account, the
 * label somebody typed is the only thing that tells their order from the
 * other four. We store it, show it, and search it. We never read it: it is
 * not parsed, not matched against anything and never acted on.
 *
 * Here rather than in `checkout-service` because two callers need it -
 * checkout and the edit on the order page - and because it is the kind of
 * rule worth being able to check without a database, a session or a Stripe
 * key. The same reason `promos/rules.ts` is its own file.
 */

import { tidyText } from '@/lib/text/tidy';

/**
 * What the column will accept: 120 characters at most, trimmed, with nothing
 * in it that cannot be sent to Postgres. `undefined` for "no label", because
 * 0085 stores null rather than an empty string - whether an order has a
 * label has to be one question rather than two.
 */
export const MAX_CUSTOMER_REFERENCE = 120;

/**
 * Clean a typed reference into what the database will take, or `undefined`.
 *
 * The cleaning itself is `tidyText`, shared with the pricing enquiry form:
 * both are free text from a human, stored in a column with a length and a
 * trim constraint on it, and two copies of the rule would drift. What is
 * specific to a reference is the ceiling and that it is one line - a run of
 * whitespace in a label is a typo, not a paragraph.
 *
 * Nothing here rejects: a label is the customer's own, and refusing
 * somebody's purchase order number at checkout over a stray character would
 * be refusing the order. It is cut to fit instead, and the only input that
 * yields nothing is input that was nothing to begin with.
 */
export function cleanCustomerReference(value: string | undefined | null): string | undefined {
  return tidyText(value, { maxChars: MAX_CUSTOMER_REFERENCE });
}
