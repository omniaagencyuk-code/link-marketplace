/**
 * Whether a run is progressing or stuck, from what the database already knows.
 *
 * Pure, so the page can say something true about a run without asking the API
 * and without a timer that resets when somebody refreshes. The figures come
 * from rows, which is why they survive a reload - the complaint that prompted
 * this was a progress message that vanished on refresh and a count that never
 * moved, with no way to tell a slow batch from a dead one.
 */

export interface BatchRow {
  id: string;
  status: string;
  mode: string;
  createdAt: string;
  /** Null until the submission is recorded. Null and old means it never was. */
  providerBatchId: string | null;
  emailCount: number;
}

/** Past this, "usually within the hour" has stopped being true. */
export const SLOW_AFTER_MINUTES = 75;

/**
 * A batch with no provider id was never successfully handed over.
 *
 * The rows are claimed before the submission so two clicks cannot send the
 * same email twice. If the process dies in between - a timeout, a deploy
 * mid-request - the batch keeps its claim and no provider id, and nothing
 * ever collects it because there is nothing to collect. A couple of minutes
 * is generous for the gap between the two writes.
 */
export const NEVER_SUBMITTED_AFTER_MINUTES = 3;

/** Anthropic's own ceiling is 24 hours. Past that it is not coming back. */
export const ABANDON_AFTER_MINUTES = 26 * 60;

export type BatchHealth = 'working' | 'slow' | 'never-submitted' | 'abandoned';

export function minutesSince(iso: string, now: Date = new Date()): number {
  const started = new Date(iso).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.round((now.getTime() - started) / 60000));
}

export function healthOf(batch: BatchRow, now: Date = new Date()): BatchHealth {
  const age = minutesSince(batch.createdAt, now);
  if (!batch.providerBatchId && age >= NEVER_SUBMITTED_AFTER_MINUTES) return 'never-submitted';
  if (age >= ABANDON_AFTER_MINUTES) return 'abandoned';
  if (age >= SLOW_AFTER_MINUTES) return 'slow';
  return 'working';
}

export interface RunProgress {
  /** Batches not yet collected. */
  running: number;
  /** Emails those batches are holding. */
  emails: number;
  oldestMinutes: number;
  /** The worst state any outstanding batch is in. */
  worst: BatchHealth;
  /** True when something should be released rather than waited for. */
  stuck: boolean;
}

const RANK: Record<BatchHealth, number> = {
  working: 0,
  slow: 1,
  'never-submitted': 2,
  abandoned: 3,
};

/**
 * One summary of everything still out.
 *
 * `emails` is counted from the batches rather than from the email rows so the
 * two can be compared: a batch holding emails nothing will ever collect is
 * exactly the condition worth naming out loud.
 */
export function runProgress(batches: BatchRow[], now: Date = new Date()): RunProgress {
  const out = batches.filter(
    (batch) => batch.status === 'submitted' || batch.status === 'running',
  );

  if (out.length === 0) {
    return { running: 0, emails: 0, oldestMinutes: 0, worst: 'working', stuck: false };
  }

  let worst: BatchHealth = 'working';
  let oldest = 0;
  let emails = 0;

  for (const batch of out) {
    const health = healthOf(batch, now);
    if (RANK[health] > RANK[worst]) worst = health;
    oldest = Math.max(oldest, minutesSince(batch.createdAt, now));
    emails += batch.emailCount;
  }

  return {
    running: out.length,
    emails,
    oldestMinutes: oldest,
    worst,
    stuck: worst === 'never-submitted' || worst === 'abandoned',
  };
}

/** Plain English for the panel, so a number never has to be interpreted. */
export function progressMessage(progress: RunProgress): string {
  const { emails, running, oldestMinutes } = progress;
  const many = emails === 1 ? 'email is' : 'emails are';
  const batches = running === 1 ? 'batch' : 'batches';
  const age = oldestMinutes < 60
    ? `${oldestMinutes} ${oldestMinutes === 1 ? 'minute' : 'minutes'}`
    : `${Math.floor(oldestMinutes / 60)} ${Math.floor(oldestMinutes / 60) === 1 ? 'hour' : 'hours'}`;

  switch (progress.worst) {
    case 'never-submitted':
      return `${emails} ${many} held by a ${batches} that never reached the API. Put them back and read them again.`;
    case 'abandoned':
      return `${emails} ${many} in a ${batches} sent ${age} ago, past the point results arrive. Put them back and read them again.`;
    case 'slow':
      return `${emails} ${many} being read. Sent ${age} ago, which is longer than usual - batches normally come back within the hour.`;
    default:
      return `${emails} ${many} being read. Sent ${age} ago. Results arrive on their own, usually within the hour.`;
  }
}
