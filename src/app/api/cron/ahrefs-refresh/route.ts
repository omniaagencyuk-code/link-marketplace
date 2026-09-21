import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { runRefresh } from '@/lib/services/refresh-service';

/**
 * The daily Ahrefs refresh.
 *
 * Called by Vercel Cron, which presents `Authorization: Bearer $CRON_SECRET`.
 * This route spends money on every successful request, so it refuses to run
 * at all when no secret is configured rather than defaulting to open - an
 * unauthenticated URL that bills an Ahrefs account is not something to leave
 * to obscurity.
 *
 * It runs on schedule whether or not the refresh is switched on. With the
 * switch off it does nothing, spends nothing and says so, which is what makes
 * the schedule itself testable before any credits are at stake.
 */

export const dynamic = 'force-dynamic';

// A full run is dozens of sequential Ahrefs calls. The default would cut it
// off part way, leaving a claimed run and a half-refreshed batch.
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;

  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Deliberately identical whether the secret is missing or wrong: the
    // response should not help anyone work out which.
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const started = Date.now();
  const outcome = await runRefresh();

  // One line per run in the Vercel logs, so the schedule can be seen working
  // without opening the admin.
  console.log(
    `[ahrefs-refresh] ${outcome.status}` +
      `${outcome.dryRun ? ' (dry run)' : ''}` +
      ` - ${outcome.reason ?? 'no reason given'}` +
      ` | refreshed=${outcome.domainsRefreshed} failed=${outcome.domainsFailed}` +
      ` batches=${outcome.batches} units=${outcome.unitsSpent}` +
      ` in ${Date.now() - started}ms`,
  );

  return NextResponse.json(outcome, {
    // A failure should be visible as a failure in Vercel's cron history.
    status: outcome.status === 'failed' ? 500 : 200,
  });
}

/** Vercel Cron uses GET; POST is here so the job can be triggered by hand. */
export const POST = GET;
