/**
 * Running a bulk action over a long selection, and saying how far it is.
 *
 * Three hundred and twenty-five listings published in one request is close to
 * a thousand database round trips made one after another. It runs past the
 * function ceiling, so nothing comes back: no count, no rows changing status,
 * nothing to do but reload and guess what happened. Sent in pieces, every
 * request answers, and the answers add up to a bar that means something.
 *
 * Pure. The wording and the grouping are the parts worth checking without a
 * database, and the grouping is the one that decides whether a person can
 * read the outcome at all.
 */

/**
 * How many listings go in one request.
 *
 * Each one is read, checked and written, so twenty-five is a few seconds -
 * short enough to return comfortably, long enough that three hundred is
 * thirteen requests rather than three hundred.
 */
export const BULK_CHUNK_SIZE = 25;

export interface SkippedRow {
  domain: string;
  reason: string;
  /**
   * The listing, when the caller knows which one it was.
   *
   * The domain is what a person reads; the id is what the table needs to keep
   * that row selected. It used to match them back up by domain against the
   * rows it was holding, which worked while it held the whole inventory and
   * stopped working the day the database started paging it - a listing
   * skipped on page nine is not among the fifty on screen.
   *
   * Optional because one skip is not a row: a request that never answered is
   * recorded as a batch, and nobody knows which of its listings changed.
   */
  id?: string;
}

export interface BulkProgress {
  /** Rows sent so far, whether they changed or not. */
  done: number;
  total: number;
  changed: number;
  skipped: SkippedRow[];
  /** The past-tense verb for what was being done, e.g. "published". */
  verb: string;
  finished: boolean;
}

/**
 * What to put beside the bar.
 *
 * While it runs, how far through - because the one thing the old version
 * never did was admit it was doing anything. When it stops, what happened to
 * every row rather than only the ones that worked: a count of publishes with
 * three hundred silent refusals behind it is worse than no count at all.
 */
export function bulkProgressText(progress: BulkProgress): string {
  const { done, total, changed, skipped, verb, finished } = progress;

  if (!finished) {
    return `${done} of ${total} done - ${changed} ${verb}. Leave this page open.`;
  }

  const noun = changed === 1 ? 'website' : 'websites';
  const held = skipped.length ? `, ${skipped.length} skipped` : '';
  return `${changed} ${noun} ${verb}${held}.`;
}

/** How full the bar is, as a percentage, and never NaN on an empty run. */
export function bulkProgressPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export interface SkipGroup {
  reason: string;
  count: number;
  /** A few examples, so the reason has something concrete attached. */
  domains: string[];
}

/**
 * The refusals, gathered by reason.
 *
 * Publishing a filtered page of drafts usually fails the same way for all of
 * them - none has a sell price yet, because approving a publisher's email
 * records what they charge us and deliberately not what we charge. Listed one
 * per line that is three hundred identical sentences, which nobody reads, and
 * the one row that failed for a different reason is lost in the middle of
 * them.
 *
 * Grouped, the screen says "320 have no sell price yet" and "1 no longer
 * exists", which are two different jobs.
 */
export function groupSkipped(skipped: SkippedRow[], examples = 3): SkipGroup[] {
  const byReason = new Map<string, SkipGroup>();

  for (const row of skipped) {
    const group = byReason.get(row.reason) ?? { reason: row.reason, count: 0, domains: [] };
    group.count += 1;
    if (group.domains.length < examples) group.domains.push(row.domain);
    byReason.set(row.reason, group);
  }

  return [...byReason.values()].sort((a, b) => b.count - a.count);
}
