'use server';

import { consumeRateLimit, rateLimitMessage, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { looksAutomated, readEnquiry, type EnquiryErrors } from '@/lib/enquiries/rules';
import { enquiryService } from '@/lib/services/enquiry-service';

/**
 * Receiving a pricing enquiry.
 *
 * The only endpoint on the site a stranger can reach that writes a row, so
 * the order of what happens here is the design:
 *
 *   1. The throttle, first and before any work. Keyed by address, counted in
 *      Postgres rather than in memory, because the app runs on serverless
 *      instances and a per-instance counter is a limit somebody can walk past
 *      by making requests until they land on a cold one.
 *   2. The honeypot, which costs nothing and catches the bots that fill every
 *      input they find.
 *   3. The rules, which are pure and live in `enquiries/rules.ts` so they can
 *      be checked without any of this.
 *   4. The write, as the service role - `pricing_enquiries` has no public
 *      insert policy, so this is the only way in.
 *
 * Nothing here returns anything about our own state. A refused submission
 * says "try again shortly", not how many we allow or how many have been sent,
 * the same way `mayRunGap` refuses without quoting our Ahrefs allowance.
 */

export interface EnquiryResult {
  ok: boolean;
  /** Per-field messages, rendered next to the inputs. */
  errors?: EnquiryErrors;
  /** One message for something that was not a field's fault. */
  error?: string;
}

export interface EnquirySubmission {
  fullName: string;
  email: string;
  company: string;
  budgetBand: string;
  interest: string;
  message: string;
  source: string;
  /** The honeypot. Hidden from people; a bot fills it. */
  website: string;
}

export async function submitPricingEnquiryAction(
  input: EnquirySubmission,
): Promise<EnquiryResult> {
  const throttle = await consumeRateLimit(RATE_LIMITS.pricingEnquiry);
  if (!throttle.allowed) {
    return { ok: false, error: rateLimitMessage(throttle) };
  }

  /*
    A filled honeypot is answered with success.

    Telling an automated submitter that it was spotted is telling whoever
    wrote it which field to leave alone next time. Nothing is stored and
    nobody is waiting for this reply, so the lie costs nothing - it is only
    ever told to something that filled a field no person can see.
  */
  if (looksAutomated(input)) return { ok: true };

  const verdict = readEnquiry(input);
  if (!verdict.ok) return { ok: false, errors: verdict.errors };

  try {
    await enquiryService.create(verdict.value);
    return { ok: true };
  } catch {
    /*
      Deliberately not the thrown message. It can carry a Postgres error -
      a column name, a constraint, a schema - and this is rendered to the
      public. What the person needs is that it did not arrive and that
      trying again is worth it.
    */
    return {
      ok: false,
      error: 'Something went wrong sending that. Please try again in a moment.',
    };
  }
}
