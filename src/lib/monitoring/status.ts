import type { VerdictKind } from './verdict';

/**
 * What a verdict does to a link's record.
 *
 * Pure, and separate from both the fetching and the database, because the
 * rules here are the ones that decide whether a publisher gets a claim raised
 * against them. They are worth being able to test exhaustively.
 */

export type LinkStatus = 'pending' | 'live' | 'failing' | 'unverifiable' | 'lost';

/** Two hard failures in a row. One is a blip; two is a pattern. */
export const HARD_FAILURES_TO_LOSE = 2;

/** Three soft failures in a row before admitting we cannot see it. */
export const SOFT_FAILURES_TO_GIVE_UP = 3;

export interface LinkState {
  status: LinkStatus;
  hardFailures: number;
  softFailures: number;
  lostAt: string | null;
  guaranteeEndsAt: string;
}

export interface NextState {
  status: LinkStatus;
  hardFailures: number;
  softFailures: number;
  lostAt: string | null;
  /** True only on the transition into lost, so a claim opens once. */
  becameLost: boolean;
  /** True only on the transition back out of lost, so a claim restores once. */
  becameLive: boolean;
}

/**
 * The next state after a check.
 *
 * The one rule with teeth: a soft failure can never produce `lost`. It does
 * not touch the hard counter and does not clear it either - a link that failed
 * hard once and was then unreadable has not been forgiven, it has simply not
 * been seen again.
 */
export function nextState(current: LinkState, kind: VerdictKind): NextState {
  const wasLost = current.status === 'lost';

  if (kind === 'ok') {
    return {
      status: 'live',
      // Both counters reset: "two in a row" has to mean in a row.
      hardFailures: 0,
      softFailures: 0,
      lostAt: null,
      becameLost: false,
      becameLive: wasLost,
    };
  }

  if (kind === 'hard') {
    const hardFailures = current.hardFailures + 1;
    const lost = hardFailures >= HARD_FAILURES_TO_LOSE;

    return {
      status: lost ? 'lost' : 'failing',
      hardFailures,
      softFailures: 0,
      lostAt: lost ? (current.lostAt ?? new Date().toISOString()) : current.lostAt,
      // Only on the way in. A link already lost that fails again does not open
      // a second claim.
      becameLost: lost && !wasLost,
      becameLive: false,
    };
  }

  // Soft. Never lost, and the hard counter is left exactly as it was.
  const softFailures = current.softFailures + 1;
  /*
    A soft failure cannot un-lose a link.

    Three failed reads normally mean "we have given up seeing this one", but on
    a link already lost it would overwrite `lost` with `unverifiable` - and the
    maintenance job only hands a claim to the buyer for a link that is still
    lost. A publisher who removed an article and then put the site behind a
    firewall would have quietly closed the whole guarantee.
  */
  const givenUp = softFailures >= SOFT_FAILURES_TO_GIVE_UP && !wasLost;
  return {
    status: givenUp ? 'unverifiable' : current.status,
    hardFailures: current.hardFailures,
    softFailures,
    lostAt: current.lostAt,
    becameLost: false,
    becameLive: false,
  };
}

/** Up to six hours, so a few thousand links do not all come due at once. */
const JITTER_MS = 6 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When to look again.
 *
 * Weekly while the guarantee runs, because that is the window where finding a
 * problem is worth something to the buyer. Monthly afterwards, because the
 * durability score keeps earning from links long after their guarantee ends
 * and a listing's score is the thing a new buyer reads.
 *
 * Tomorrow after any failure, hard or soft: a hard failure needs its second
 * opinion quickly, and a soft one is usually a site that will be reachable
 * again shortly.
 */
export function nextCheckAt(
  kind: VerdictKind,
  guaranteeEndsAt: string,
  now: Date = new Date(),
  random: () => number = Math.random,
): string {
  const jitter = Math.floor(random() * JITTER_MS);

  if (kind !== 'ok') return new Date(now.getTime() + DAY_MS + jitter).toISOString();

  const underGuarantee = new Date(guaranteeEndsAt).getTime() > now.getTime();
  const base = underGuarantee ? 7 * DAY_MS : 30 * DAY_MS;

  return new Date(now.getTime() + base + jitter).toISOString();
}
