/**
 * The addresses we send outreach from.
 *
 * Every thread has two sides and only one of them is worth reading. These are
 * ours: the mbox reader skips messages from them, and the Gmail importer uses
 * them to decide whether a thread ever got a reply at all.
 *
 * Pure and dependency-free so both readers can share it, and so the list can
 * be tested without a mailbox.
 *
 * This lived as a single hardcoded address inside the mbox reader. It moved
 * here when the Gmail importer arrived, because a thread pulled from
 * info@omniaagency.uk and judged against jack@omniamedia.uk would look like a
 * publisher writing to us unprompted - and every one of our own sent messages
 * would have been read as a reply, and paid for.
 */

const OUTREACH_ADDRESSES = [
  'jack@omniamedia.uk',
  'info@omniaagency.uk',
  'info@omnia-marketing.co.uk',
  'contact@omniaagency.uk',
  'contact@omnia-marketing.co.uk',
];

/** Our outreach addresses, lowercased. */
export function outreachAddresses(): string[] {
  return [...OUTREACH_ADDRESSES];
}

/**
 * Is this one of ours?
 *
 * Mailboxes we import from count too, whether or not they are on the list
 * above: a mailbox somebody added to the allowlist is by definition one we
 * send from, and treating its sent mail as a publisher reply would send our
 * own words to the model as though a publisher had written them.
 */
export function isOurs(address: string, alsoOurs: string[] = []): boolean {
  const normalised = address.trim().toLowerCase();
  if (!normalised) return false;
  if (OUTREACH_ADDRESSES.includes(normalised)) return true;
  return alsoOurs.some((extra) => extra.trim().toLowerCase() === normalised);
}
