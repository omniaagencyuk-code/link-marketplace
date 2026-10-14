/**
 * What the pricing enquiry form offers, and what it will accept back.
 *
 * One copy, read by the form that renders the dropdowns, by the action that
 * validates the submission, and by the admin screen that filters on them. A
 * second list would drift, and the half that drifted would be the one
 * silently rejecting an answer the form had just offered.
 *
 * The labels are stored as typed rather than mapped to codes. A budget band
 * is a statement about what somebody expects to spend, not a measurement,
 * and "£1,000-£2,500" is exactly as precise as the person was being. Storing
 * `2500` would invent a number they never gave us.
 */

/** Budget bands, in the order the dropdown shows them. */
export const BUDGET_BANDS = [
  'Under £500',
  '£500–£1,000',
  '£1,000–£2,500',
  '£2,500–£5,000',
  '£5,000–£10,000',
  '£10,000+',
  'Not sure yet',
] as const;

/** What the enquiry is about. */
export const INTERESTS = [
  'Bulk order discounts',
  'Regular buyer rates',
  'Custom website deals',
  'Agency partnership',
  'General enquiry',
] as const;

export type BudgetBand = (typeof BUDGET_BANDS)[number];
export type Interest = (typeof INTERESTS)[number];

/** Where an enquiry was submitted from, so a banner that works can be told apart. */
export const ENQUIRY_SOURCES = ['pricing-page', 'marketplace-banner'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

/** The four states an enquiry can be in. Deliberately not a workflow. */
export const ENQUIRY_STATUSES = ['new', 'in-progress', 'closed', 'spam'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  'in-progress': 'In progress',
  closed: 'Closed',
  spam: 'Spam',
};

/**
 * The limits the column checks enforce, named once.
 *
 * 0086 bounds every one of these in the database as well, because this is
 * the one table a stranger can cause a write to and a check somebody
 * remembers to call is not a check. These are here so the form can say no
 * first, in the browser, where it can be helpful about it.
 */
export const LIMITS = {
  name: 120,
  email: 320,
  company: 160,
  message: 4000,
} as const;

/** True when the value is one of the options we offered. */
export function isBudgetBand(value: string): value is BudgetBand {
  return (BUDGET_BANDS as readonly string[]).includes(value);
}

export function isInterest(value: string): value is Interest {
  return (INTERESTS as readonly string[]).includes(value);
}

export function isEnquirySource(value: string): value is EnquirySource {
  return (ENQUIRY_SOURCES as readonly string[]).includes(value);
}

export function isEnquiryStatus(value: string): value is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly string[]).includes(value);
}
