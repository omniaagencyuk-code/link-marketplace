/**
 * What the "list your site" form offers, and what it will accept back.
 *
 * One copy, read by the form that renders the inputs, by the rules that read
 * a submission, and by the admin screen that filters on them - the same
 * arrangement `enquiries/options.ts` has, for the same reason: a second list
 * drifts, and the half that drifts is the one silently refusing an answer the
 * form had just offered.
 *
 * ## What this deliberately does not ask for
 *
 * No domain rating, no traffic figure, no referring domains. We measure those
 * ourselves from Ahrefs and Majestic, and a number a seller types about their
 * own site is a number we would have to disbelieve before we could use it.
 * Asking invites it to be inflated and then makes the form longer for
 * everybody honest.
 */

/** What they are offering to sell. */
export const PLACEMENT_TYPES = [
  'Guest post',
  'Niche edit',
  'Both',
  'Something else',
] as const;

/**
 * The three the rest of the application prices in.
 *
 * A price with a currency we do not recognise is dropped rather than guessed
 * at - see `readSubmission`. What a number means is not something to infer
 * from the shape of the number.
 */
export const CURRENCIES = ['GBP', 'USD', 'EUR'] as const;

export type PlacementType = (typeof PLACEMENT_TYPES)[number];
export type SubmissionCurrency = (typeof CURRENCIES)[number];

/** Where a submission came from, so a page that works can be told apart. */
export const SUBMISSION_SOURCES = ['list-your-site'] as const;
export type SubmissionSource = (typeof SUBMISSION_SOURCES)[number];

/**
 * The five states a submission can be in.
 *
 * One more than a pricing enquiry has, and the extra two are the point: an
 * enquiry ends by being answered, while an offer of a site ends by the site
 * being listed or not. "Closed" would record that somebody dealt with it and
 * lose which way it went, which is the only part worth knowing a year later
 * when the same domain writes in again.
 */
export const SUBMISSION_STATUSES = [
  'new',
  'in-progress',
  'listed',
  'declined',
  'spam',
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  new: 'New',
  'in-progress': 'In progress',
  listed: 'Listed',
  declined: 'Declined',
  spam: 'Spam',
};

/**
 * The limits the column checks enforce, named once.
 *
 * The migration bounds every one of these in the database as well, because
 * this is a table a stranger can cause a write to and a check somebody
 * remembers to call is not a check. These are here so the form can say no
 * first, in the browser, where it can be helpful about it.
 */
export const LIMITS = {
  name: 120,
  email: 320,
  /** The longest a hostname can be, which `isValidDomain` also enforces. */
  domain: 253,
  message: 4000,
  /** In major units. A placement priced above this was a typo or a joke. */
  maxPrice: 1_000_000,
} as const;

export function isPlacementType(value: string): value is PlacementType {
  return (PLACEMENT_TYPES as readonly string[]).includes(value);
}

export function isSubmissionCurrency(value: string): value is SubmissionCurrency {
  return (CURRENCIES as readonly string[]).includes(value);
}

export function isSubmissionSource(value: string): value is SubmissionSource {
  return (SUBMISSION_SOURCES as readonly string[]).includes(value);
}

export function isSubmissionStatus(value: string): value is SubmissionStatus {
  return (SUBMISSION_STATUSES as readonly string[]).includes(value);
}
