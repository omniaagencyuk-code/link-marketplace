/**
 * What an offer of a site has to contain before we will store it.
 *
 * Pure, and that is the point: this is a form a stranger can submit, so the
 * rules deciding what it accepts should be checkable without a database, a
 * session or a network. `verify:publishers` runs every case here in under a
 * second.
 *
 * The shape is the one `enquiries/rules.ts` already uses - a verdict rather
 * than a thrown error - because the form has to put each message next to the
 * input it belongs to, and an exception carries one message for a form that
 * may have four problems.
 */

import { isValidDomain, normaliseDomain } from '@/lib/import/normalise';
import { tidyText } from '@/lib/text/tidy';
import {
  isPlacementType,
  isSubmissionCurrency,
  isSubmissionSource,
  LIMITS,
  type PlacementType,
  type SubmissionCurrency,
  type SubmissionSource,
} from './options';

/**
 * Money, to the penny, and the currency if they typed one.
 *
 * Deliberately not `parseNumber` or `parsePrice` from the importer. Those
 * round to a whole unit - they were written for traffic counts and a CSV of
 * round prices - so "180.50" would come back as 181, and a publisher who
 * quoted a price would be listed at one they never gave.
 *
 * A symbol or a code in the text wins over the dropdown beside it. Somebody
 * typing "$150" has said which currency they mean; the dropdown's default is
 * something they may never have looked at, and storing GBP against a dollar
 * price is the error this whole pair of columns exists to prevent.
 */
const MONEY = /^-?\d{1,9}(?:\.\d+)?k?$/;

function readMoney(raw: string): { minor: number; currency?: SubmissionCurrency } | null {
  const symbol = raw.includes('£')
    ? 'GBP'
    : raw.includes('$')
      ? 'USD'
      : raw.includes('€')
        ? 'EUR'
        : undefined;

  const code = /\b(gbp|usd|eur)\b/i.exec(raw)?.[1]?.toUpperCase();
  const typed = code && isSubmissionCurrency(code) ? code : symbol;

  const cleaned = raw
    .replace(/[£$€]/g, '')
    .replace(/\b(gbp|usd|eur)\b/gi, '')
    .replace(/[\s,_]/g, '')
    .toLowerCase();

  if (!MONEY.test(cleaned)) return null;

  const scale = cleaned.endsWith('k') ? 1_000 : 1;
  const amount = Number(cleaned.replace(/k$/, '')) * scale;
  if (!Number.isFinite(amount)) return null;

  // Rounded to the penny. A third decimal in a price is a typo, and keeping
  // it would be storing a fraction of a penny nobody can pay.
  return { minor: Math.round(amount * 100), currency: typed };
}

export interface SubmissionInput {
  fullName?: string | null;
  email?: string | null;
  domain?: string | null;
  placementType?: string | null;
  price?: string | null;
  currency?: string | null;
  message?: string | null;
  source?: string | null;
  /** The honeypot. See `looksAutomated`. */
  phone?: string | null;
}

export interface CleanSubmission {
  fullName: string;
  email: string;
  /** Normalised the way the importer normalises, so one site is one row. */
  domain: string;
  placementType?: PlacementType;
  /** Minor units. Null unless a currency we recognise came with it. */
  priceMinor?: number;
  currency?: SubmissionCurrency;
  message?: string;
  source: SubmissionSource;
}

export type SubmissionErrors = Partial<Record<keyof SubmissionInput, string>>;

export type SubmissionVerdict =
  | { ok: true; value: CleanSubmission }
  | { ok: false; errors: SubmissionErrors };

/*
  The same loose pattern the rest of the codebase uses. An address is proved
  by sending to it, not by a regular expression, and every stricter one
  rejects something real. Here the expensive error is rejecting a publisher
  who wanted to sell us a site; a typo costs one bounced reply.
*/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The honeypot, and why it is not called `website`.
 *
 * The pricing form's hidden field is named `website`, which works there
 * because nobody enquiring about rates is asked for one. On this form a
 * website is the whole submission, so a field of that name would be filled
 * by every real publisher and the form would silently discard all of them.
 *
 * `phone` is the bait instead: plausible enough that a bot filling every
 * input will fill it, and a field this form never asks a person for.
 */
export function looksAutomated(input: SubmissionInput): boolean {
  return Boolean(input.phone && String(input.phone).trim());
}

/**
 * A stored price, read back.
 *
 * The column pair cannot hold a number without its currency - 0092 checks
 * it - but a row written before that check, or by hand, could. This is the
 * one copy of what to do about that, used by the service that reads the
 * table and checked here rather than only in SQL: a figure with no currency
 * is not a cheap price, it is a number nobody can act on, and showing it is
 * worse than showing nothing.
 */
export function readStoredPrice(
  priceMinor: number | null | undefined,
  currency: string | null | undefined,
): { priceMinor: number; currency: SubmissionCurrency } | null {
  if (priceMinor == null || !currency) return null;
  if (!isSubmissionCurrency(currency)) return null;
  if (priceMinor <= 0) return null;
  return { priceMinor, currency };
}

/**
 * Read a submission.
 *
 * Every field is tidied before it is judged, so a name of three spaces is
 * missing rather than present, and what the checks see is what the column
 * will store.
 */
export function readSubmission(input: SubmissionInput): SubmissionVerdict {
  const errors: SubmissionErrors = {};

  const fullName = tidyText(input.fullName, { maxChars: LIMITS.name });
  if (!fullName) errors.fullName = 'Tell us your name.';

  // Lower-cased, so one publisher writing twice is one address in the list.
  const email = tidyText(input.email, { maxChars: LIMITS.email })?.toLowerCase();
  if (!email) {
    errors.email = 'We need an email address to reply to.';
  } else if (!EMAIL.test(email)) {
    errors.email = 'That does not look like an email address.';
  }

  /*
    Normalised with the importer's own function rather than a second one.

    A publisher pasting "https://www.example.com/write-for-us" and a
    publisher typing "example.com" are offering the same site, and the
    duplicate only shows up if both reduce to the same string. This is the
    function the CSV importer and the sourcing pipeline already reduce with.
  */
  const domainRaw = tidyText(input.domain, { maxChars: LIMITS.domain + 40 });
  const domain = domainRaw ? normaliseDomain(domainRaw) : null;
  if (!domain) {
    errors.domain = 'Tell us which website you are offering.';
  } else if (!isValidDomain(domain)) {
    errors.domain = 'That does not look like a website address.';
  }

  const message = tidyText(input.message, { maxChars: LIMITS.message, multiline: true });

  /*
    A choice we did not offer is dropped rather than refused.

    No real submission can produce one - the form renders only what
    `options.ts` lists - so refusing would turn a tampered or stale field
    into a lost publisher, and this one was optional anyway.
  */
  const placementRaw = tidyText(input.placementType, { maxChars: 40 });
  const placementType =
    placementRaw && isPlacementType(placementRaw) ? placementRaw : undefined;

  const sourceRaw = tidyText(input.source, { maxChars: 40 });
  const source: SubmissionSource =
    sourceRaw && isSubmissionSource(sourceRaw) ? sourceRaw : 'list-your-site';

  /*
    The price, and the one rule here worth arguing about.

    A number is only stored with a currency we recognise. A price whose
    currency we had to guess is the mistake `repeat-offers` has a floor
    against in the other direction: a figure that becomes what we think a
    placement costs, derived from something nobody actually said. So a
    tampered or missing currency drops the price and keeps everything else -
    the submission still reaches us with the site, the name and the address,
    and the price is a question we can ask.

    An unreadable number is a field error rather than a silent drop, because
    unlike the currency this is something a person typed and can correct.
  */
  let priceMinor: number | undefined;
  let currency: SubmissionCurrency | undefined;

  const priceRaw = tidyText(input.price, { maxChars: 40 });
  if (priceRaw) {
    const money = readMoney(priceRaw);
    if (!money || money.minor <= 0) {
      errors.price = 'Give the price as a number, like 150.';
    } else if (money.minor > LIMITS.maxPrice * 100) {
      errors.price = 'That price looks too high. Tell us about it in the box below instead.';
    } else {
      const chosen = tidyText(input.currency, { maxChars: 10 })?.toUpperCase();
      const picked =
        money.currency ?? (chosen && isSubmissionCurrency(chosen) ? chosen : undefined);
      if (picked) {
        currency = picked;
        priceMinor = money.minor;
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      fullName: fullName!,
      email: email!,
      domain: domain!,
      placementType,
      priceMinor,
      currency,
      message,
      source,
    },
  };
}
