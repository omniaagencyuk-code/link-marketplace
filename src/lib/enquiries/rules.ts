/**
 * What a pricing enquiry has to contain before we will store it.
 *
 * Pure, and that is the point: this is the one form on the site a stranger
 * can submit, so the rules deciding what it accepts should be checkable
 * without a database, a session or a network. `verify:enquiries` runs every
 * case here in under a second.
 *
 * The shape is deliberately the same as the rest of the codebase's decision
 * modules - a function that returns a verdict rather than one that throws -
 * because the caller has to render the errors next to the fields, and an
 * exception carries one message for a form that may have four problems.
 */

import { tidyText } from '@/lib/text/tidy';
import {
  isBudgetBand,
  isEnquirySource,
  isInterest,
  LIMITS,
  type BudgetBand,
  type EnquirySource,
  type Interest,
} from './options';

export interface EnquiryInput {
  fullName?: string | null;
  email?: string | null;
  company?: string | null;
  budgetBand?: string | null;
  interest?: string | null;
  message?: string | null;
  source?: string | null;
  /** The honeypot. See `looksAutomated`. */
  website?: string | null;
}

export interface CleanEnquiry {
  fullName: string;
  email: string;
  company?: string;
  budgetBand?: BudgetBand;
  interest?: Interest;
  message: string;
  source: EnquirySource;
}

/** Field key to message. Keyed so the form can put each one by its input. */
export type EnquiryErrors = Partial<Record<keyof EnquiryInput, string>>;

export type EnquiryVerdict =
  | { ok: true; value: CleanEnquiry }
  | { ok: false; errors: EnquiryErrors };

/*
  The same shape `gmail-import-service` and `import/prepare` already use.

  Deliberately loose. An address is proved by sending to it, not by a
  pattern, and every stricter regex anybody writes rejects something valid -
  apostrophes in Irish surnames, new top level domains, plus-addressing.
  Rejecting a real buyer's address to feel rigorous is the expensive error
  here; a typo costs us one bounced reply.
*/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The honeypot.
 *
 * A field named `website` that is hidden from people and left empty by them.
 * Bots fill every input they find, so anything in it means the submission was
 * not typed. Chosen over a CAPTCHA on purpose: a CAPTCHA is a third-party
 * script, a cookie and a tax on every real enquirer, to protect a form whose
 * worst case is a row in a table only administrators read.
 *
 * What this cannot do is stop somebody who looked at the markup. The throttle
 * in the action is what bounds that, and the length checks bound what a
 * single submission can cost.
 */
export function looksAutomated(input: EnquiryInput): boolean {
  return Boolean(input.website && String(input.website).trim());
}

/**
 * Read a submission.
 *
 * Every field is tidied before it is judged, so a name of three spaces is
 * missing rather than present, and what the checks see is what the column
 * will store.
 */
export function readEnquiry(input: EnquiryInput): EnquiryVerdict {
  const errors: EnquiryErrors = {};

  const fullName = tidyText(input.fullName, { maxChars: LIMITS.name });
  if (!fullName) errors.fullName = 'Tell us your name.';

  /*
    Lower-cased, because an address is not case sensitive in the part that
    matters and storing "Sarah@Agency.com" means the same person enquiring
    twice looks like two people to anybody scanning the list.
  */
  const email = tidyText(input.email, { maxChars: LIMITS.email })?.toLowerCase();
  if (!email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!EMAIL.test(email)) {
    errors.email = 'That does not look like an email address.';
  }

  const company = tidyText(input.company, { maxChars: LIMITS.company });

  const message = tidyText(input.message, { maxChars: LIMITS.message, multiline: true });
  if (!message) errors.message = 'Tell us a little about what you need.';

  /*
    A dropdown answer we did not offer is not a validation error to show
    somebody - no real submission can produce one, because the form only
    renders the options in `options.ts`. It is dropped instead, so a tampered
    or stale submission still reaches us with its name, address and message
    intact rather than being refused over a field that was optional anyway.
  */
  const budgetRaw = tidyText(input.budgetBand, { maxChars: 40 });
  const budgetBand = budgetRaw && isBudgetBand(budgetRaw) ? budgetRaw : undefined;

  const interestRaw = tidyText(input.interest, { maxChars: 40 });
  const interest = interestRaw && isInterest(interestRaw) ? interestRaw : undefined;

  // Same reasoning, and it is ours rather than theirs: an unknown source
  // means the page was changed without this list, not that the enquiry is bad.
  const sourceRaw = tidyText(input.source, { maxChars: 40 });
  const source: EnquirySource =
    sourceRaw && isEnquirySource(sourceRaw) ? sourceRaw : 'pricing-page';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      fullName: fullName!,
      email: email!,
      company,
      budgetBand,
      interest,
      message: message!,
      source,
    },
  };
}
