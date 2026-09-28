/**
 * Which threads a run should actually fetch.
 *
 * Pure, and separate from the service, because this is the rule that decides
 * what an import costs. Get it too eager and every run re-reads the whole
 * backlog; get it too lazy and a publisher's answer to our follow-up never
 * arrives. Both failures are quiet, so the rule is tested rather than
 * trusted.
 */

export interface SeenThread {
  id: string;
  gmail_thread_id: string;
  history_id: string | null;
  status: string;
}

export interface ThreadRefLike {
  id: string;
  historyId?: string;
}

export interface QueuePlan<T extends ThreadRefLike> {
  /** Never seen in this mailbox. Insert them. */
  insert: T[];
  /** Seen, but changed since. The row ids to put back to pending. */
  requeue: string[];
}

/**
 * Split what the search found into new work and changed work.
 *
 * Three cases, and the third is the one worth being careful about:
 *
 *   Not seen before          -> fetch it.
 *   Seen, still pending      -> already queued; leave it where it is.
 *   Seen, and the historyId has moved -> new messages on the thread, which
 *                               is the reply we were waiting for. Fetch again.
 *
 * A thread whose historyId is unchanged is left alone, which is what makes
 * re-running the same query nearly free. An old row with no recorded
 * historyId is *not* re-queued on suspicion: doing that would re-fetch the
 * entire backlog on every run, which is the expensive way to be wrong.
 */
export function planQueue<T extends ThreadRefLike>(refs: T[], seen: SeenThread[]): QueuePlan<T> {
  const known = new Map(seen.map((row) => [row.gmail_thread_id, row]));

  const insert: T[] = [];
  const requeue: string[] = [];

  for (const ref of refs) {
    const previous = known.get(ref.id);

    if (!previous) {
      insert.push(ref);
      continue;
    }
    if (previous.status === 'pending') continue;
    if (ref.historyId && previous.history_id && ref.historyId !== previous.history_id) {
      requeue.push(previous.id);
    }
  }

  return { insert, requeue };
}
