/**
 * Reading Stripe's answer when we try to close a checkout session.
 *
 * Reusing a customer's open order means pointing it at a new Stripe session,
 * and the old one stays payable for 24 hours unless it is expired first. The
 * webhook finds orders by session id, so a payment made in an old tab after
 * the id has moved on would arrive with nothing to attach itself to.
 *
 * So the expiry call decides whether reuse is safe, and its *failures* are
 * not all alike. This is the rule for reading them, kept apart from the
 * action so it can be asserted rather than hoped for: the one case that is
 * safe is a session Stripe says is already expired, because there is
 * nothing left to make unpayable.
 */

/**
 * True only where the old checkout is certainly unpayable now.
 *
 * Everything else is false, and the caller writes a new order instead -
 * which is what happened before any of this existed, so the fallback is a
 * behaviour with a year of use behind it rather than a guess.
 *
 * **"Completed" is deliberately false.** It means the customer has paid and
 * the webhook has not landed yet: their order is a second away from being
 * somebody's purchase, and rewriting its lines would change what they
 * bought. The duplicate row that results from not reusing it is the
 * cheaper mistake by a wide margin.
 */
export function sessionIsUnpayable(message: string): boolean {
  return /already expired|has expired|is expired/i.test(message);
}
