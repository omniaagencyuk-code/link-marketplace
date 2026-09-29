/**
 * Approving a lot of drafts at once, in pieces small enough to come back.
 *
 * Two hundred approvals in one server action is two thousand database round
 * trips, made one after another. The request runs past the function ceiling,
 * the browser is left holding a promise that never settles, and the page
 * shows nothing at all - no count, no error, no rows removed - until
 * somebody reloads it by hand. The approvals had happened. What went missing
 * was the answer.
 *
 * So the browser sends them a chunk at a time. Every request is short enough
 * to return, every answer lands before the next is sent, and a run that dies
 * half way has still approved exactly what it reported approving.
 *
 * Pure: no database, no React. The size and the wording are the two things
 * worth being able to check without either.
 */

/**
 * How many drafts go in one request.
 *
 * Each approval is around ten sequential round trips - the website, its
 * services, its costs, its niche policy, its commercials, then pricing - so
 * twenty is a few seconds of work. Small enough that nothing times out,
 * large enough that two hundred drafts is ten requests rather than a
 * hundred.
 */
export const APPROVE_CHUNK_SIZE = 20;

export function chunk<T>(items: readonly T[], size: number = APPROVE_CHUNK_SIZE): T[][] {
  if (size < 1) throw new Error('A chunk has to hold at least one draft.');
  const chunks: T[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

export interface ApproveProgress {
  /** Drafts sent so far, whether they were approved or not. */
  done: number;
  total: number;
  approved: number;
  /** Domains that could not be approved, in the order they failed. */
  failures: string[];
  /**
   * Drafts the server declined to sweep up: flagged, contested, or already
   * reviewed since the page was drawn. Not failures - they are still in the
   * queue, waiting for the human they were held back for.
   */
  skipped: number;
  finished: boolean;
}

/**
 * What to put on screen while this runs, and after.
 *
 * The running text says how far through it is, because the one thing the old
 * version never did was admit it was doing anything. The finished text says
 * what happened to every draft, not just the ones that worked: a count of
 * approvals with three silent failures behind it is how a domain goes
 * missing without anyone noticing.
 */
export function progressText(progress: ApproveProgress): string {
  const { done, total, approved, failures, skipped, finished } = progress;

  if (!finished) {
    return `Approving - ${done} of ${total} done. Leave this page open.`;
  }

  const held = skipped
    ? ` ${skipped} ${skipped === 1 ? 'was' : 'were'} left in the queue for a human.`
    : '';

  const couldNot = failures.length
    ? ` Could not approve ${failures.length}: ${failures.slice(0, 5).join(', ')}${
        failures.length > 5 ? ` and ${failures.length - 5} more` : ''
      }.`
    : '';

  return `Approved ${approved} of ${total}.${held}${couldNot}`;
}
