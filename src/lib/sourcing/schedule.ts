/**
 * Whether tonight's import is due.
 *
 * Pure, because "did it already run today" is the question a schedule gets
 * wrong in the ways that matter: running twice costs an extra read of
 * everything, and never running is invisible until somebody notices the
 * queue has been empty for a week.
 */

/**
 * Close enough to a day to be safe either side.
 *
 * Cron fires on a wall clock and a run takes minutes, so the gap between two
 * consecutive nightly runs is not exactly 24 hours. Twenty hours means a
 * retry an hour later is refused, while a schedule that slips forward over a
 * clock change still fires.
 */
export const NIGHTLY_MIN_GAP_MINUTES = 20 * 60;

export interface NightlyState {
  enabled: boolean;
  lastRunAt: string | null;
  /** True when a job from an earlier run has not finished. */
  jobInFlight: boolean;
}

export type NightlySkip = 'off' | 'already-ran' | 'still-running';

/** Null when it should run, or the reason it should not. */
export function nightlySkipReason(
  state: NightlyState,
  now: Date = new Date(),
): NightlySkip | null {
  if (!state.enabled) return 'off';

  // A job still fetching is last night's, or this morning's retry. Starting
  // another would list the same threads again and fight it for the claim.
  if (state.jobInFlight) return 'still-running';

  if (state.lastRunAt) {
    const since = (now.getTime() - new Date(state.lastRunAt).getTime()) / 60000;
    if (Number.isFinite(since) && since < NIGHTLY_MIN_GAP_MINUTES) return 'already-ran';
  }

  return null;
}

export function describeSkip(reason: NightlySkip): string {
  switch (reason) {
    case 'off':
      return 'The nightly import is switched off.';
    case 'already-ran':
      return 'It already ran today.';
    default:
      return 'The previous run has not finished yet.';
  }
}
