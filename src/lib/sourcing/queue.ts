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
