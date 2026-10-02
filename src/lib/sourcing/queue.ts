/**
 * What is actually waiting for a reviewer.
 *
 * One function, because the order of two steps was the bug and the order of
 * two steps is what this pins down.
 *
 * The queue page used to ask the database for the first two hundred pending
 * drafts and then drop the contested ones from what came back. A domain
 * offered by two people is not review work - it is a comparison, and it has
 * a page of its own - so those rows are right to go. The mistake was
 * removing them after the limit had already been spent on them.
 *
 * With several hundred domains offered twice, most of that two hundred was
 * discarded and the table showed whatever few survived. Approving those
 * cleared them; the next read brought back another few; the queue appeared
 * to refill forever. Fifty-eight waiting, twenty approved, again, and again.
 *
 * Filtering first is the fix, and the reason it has to happen here rather
 * than in the query is that "contested" is worked out from the drafts
 * themselves - which domain appears twice - and not stored on the row.
 */

/**
 * The drafts a person can approve from the queue, and how many there are.
 *
 * `total` counts every one of them, not the length of the slice being shown.
 * Those were the same number before, and that is why neither was right: the
 * header reported the size of a list that had already been cut down, so the
 * queue never admitted how much was behind it.
 */
export function waitingForReview<T extends { domain: string }>(
  all: readonly T[],
  contested: ReadonlySet<string>,
  limit: number,
): { rows: T[]; total: number } {
  const mine = all.filter((row) => !contested.has(row.domain));
  return { rows: mine.slice(0, Math.max(0, limit)), total: mine.length };
}

/**
 * What "select all" means on the duplicates page.
 *
 * One chosen draft per domain, which is the shape the approval takes: a
 * domain can only be settled once, so the selection is a map keyed by domain
 * rather than a set of drafts, and picking a second offer for a domain
 * replaces the first rather than queueing both.
 *
 * The choice defaults to the first offer still waiting. The offers arrive
 * cheapest-convertible first, so that is the cheapest - the one already
 * marked on the card - and the radio beside each row is how to say
 * otherwise.
 *
 * A group with nothing waiting is left out entirely. It has already been
 * dealt with, and including it would put a domain in the count that neither
 * button could do anything about.
 */
export function defaultChoices<
  T extends { domain: string; offers: readonly { draftId: string; status: string }[] },
>(groups: readonly T[]): Map<string, string> {
  const chosen = new Map<string, string>();
  for (const group of groups) {
    const waiting = group.offers.find((offer) => offer.status === 'pending');
    if (waiting) chosen.set(group.domain, waiting.draftId);
  }
  return chosen;
}

/**
 * The drafts that would create a listing, and the ones that would change one.
 *
 * Approving these does two different things, and the difference matters more
 * than the table let on. A new draft creates a listing nobody was selling.
 * An update overwrites what we pay on a listing already in the marketplace -
 * its cost price, its per-niche costs, its payment terms, its contact - and
 * leaves the sell price where it is. So approving a hundred of them in one
 * press can quietly cut the margin on a hundred listings.
 *
 * Splitting the selection is what lets a reviewer take the safe half now and
 * look at the other half properly.
 */
export function splitByKind<T extends { matched: boolean }>(
  drafts: readonly T[],
): { created: T[]; updated: T[] } {
  return {
    created: drafts.filter((draft) => !draft.matched),
    updated: drafts.filter((draft) => draft.matched),
  };
}

/**
 * Is this update coming from somebody other than whoever last quoted us?
 *
 * The duplicates page holds back a domain two *pending replies* offer. It says
 * nothing about a reply that competes with a listing already approved - one
 * draft for the domain is not contested, so it goes in the ordinary queue and
 * bulk approve walks straight through it, replacing the price one seller gave
 * us with another seller's.
 *
 * Compared against the sender of the email the current price came from, not
 * against the contact address on the listing: a publisher legitimately writes
 * from a personal address and signs with a `sales@` one, so comparing those
 * would flag half the queue. "Who last quoted this to us" is the question
 * worth asking, and it is the one that costs money to get wrong.
 *
 * Unknown means unflagged. A listing imported from a CSV has no email behind
 * its price, and flagging every one of those would make the flag noise.
 */
export function fromADifferentSeller(draft: {
  matched: boolean;
  fromAddress: string;
  lastQuotedBy?: string | null;
}): boolean {
  if (!draft.matched) return false;
  const previous = draft.lastQuotedBy?.trim().toLowerCase();
  const now = draft.fromAddress.trim().toLowerCase();
  if (!previous || !now) return false;
  return previous !== now;
}

/**
 * The flag name, shared so the queue that sets it and the table that labels it
 * cannot disagree about its spelling - a mislabelled flag reads as a raw slug
 * next to six readable ones, and a misspelled one reads as nothing at all.
 */
export const DIFFERENT_SELLER = 'different-seller';
