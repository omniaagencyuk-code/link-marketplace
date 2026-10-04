import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { runDueChecks } from '@/lib/services/link-monitor-service';

/**
 * The link checker.
 *
 * Runs every quarter of an hour through the small hours, because that is when
 * a few hundred requests to other people's servers are least likely to be
 * noticed by anybody - including us, if a publisher's firewall decides to
 * answer all of them with a challenge.
 *
 * Bounded three ways: two hundred links, eight at a time, and a 240 second
 * budget inside a 300 second function. The budget is the one that matters. A
 * function killed at the ceiling has written some rows and not others, and
 * next run reads the ones it did not reach as still due - which is correct
 * but hides the fact that the run was cut off. Stopping on our own terms puts
 * `outOfTime` in the log instead.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const outcome = await runDueChecks({ limit: 200, concurrency: 8, budgetMs: 240_000 });

  console.log(
    `[link-monitor] checked=${outcome.checked} ok=${outcome.ok} hard=${outcome.hard}` +
      ` soft=${outcome.soft} lost=${outcome.lost} restored=${outcome.restored}` +
      ` claims=${outcome.claimsOpened}${outcome.outOfTime ? ' (out of time)' : ''}` +
      ` in ${outcome.ms}ms`,
  );

  return NextResponse.json(outcome);
}
