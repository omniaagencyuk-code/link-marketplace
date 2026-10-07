import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { advanceApprovalRun } from '@/lib/services/draft-approval-run';

/**
 * Carries an approve-all on after whoever started it has gone.
 *
 * The same arrangement as the description sweep, and for the same reason: a
 * button press lives as long as the request, a request lives three hundred
 * seconds, and eight thousand approvals is twenty minutes. So the press starts
 * the run and this finishes it, a slice every few minutes, whether or not
 * anybody is logged in.
 *
 * It does nothing at all when no run is going, which is most of the time - one
 * small query and out. Nothing here starts a run: approving the queue is a
 * decision somebody makes, never a nightly habit.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Leaves a minute's headroom to write the counters before the function ends. */
const BUDGET_MS = 240_000;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Identical whether the secret is missing or wrong.
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const started = Date.now();
  const outcome = await advanceApprovalRun(BUDGET_MS);

  // Silent on an idle tick: a line every five minutes saying "nothing to do"
  // buries the lines that matter.
  if (!outcome.idle) {
    console.log(
      `[approve-all] approved=${outcome.approved} failed=${outcome.failed}` +
        `${outcome.finished ? ' (run finished)' : ''}` +
        `${outcome.outOfTime ? ' (out of time, continues next tick)' : ''}` +
        ` in ${Date.now() - started}ms`,
    );
  }

  return NextResponse.json(outcome);
}

/** Vercel Cron uses GET; POST is here so it can be triggered by hand. */
export const POST = GET;
