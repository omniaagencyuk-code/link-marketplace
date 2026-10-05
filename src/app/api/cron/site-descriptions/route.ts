import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { advanceDescriptionRun } from '@/lib/services/site-description-service';

/**
 * Carries the description sweep on after whoever started it has gone.
 *
 * This is the whole reason the sweep is a row rather than a button press. A
 * press lives as long as the request, and a request lives three hundred
 * seconds; three thousand homepages is around an hour. So the press starts the
 * run and this finishes it, a slice every few minutes, whether or not anybody
 * is logged in.
 *
 * It does nothing at all when no run is going, which is most of the time - one
 * small query and out. Nothing here starts a sweep on its own: filling
 * descriptions is a decision somebody makes, not a nightly habit.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Leaves a minute's headroom to write the counters before the function ends. */
const BUDGET_MS = 240_000;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;

  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Identical whether the secret is missing or wrong.
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const started = Date.now();
  const outcome = await advanceDescriptionRun(BUDGET_MS);

  // Silent on an idle tick: a line every five minutes saying "nothing to do"
  // buries the lines that matter.
  if (!outcome.idle) {
    console.log(
      `[site-descriptions] looked=${outcome.looked} filled=${outcome.filled}` +
        `${outcome.finished ? ' (run finished)' : ''}` +
        `${outcome.outOfTime ? ' (out of time, continues next tick)' : ''}` +
        ` in ${Date.now() - started}ms`,
    );
  }

  return NextResponse.json(outcome);
}
