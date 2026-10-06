import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { salesAttributionService } from '@/lib/services/sales-attribution-service';

/**
 * Noticing when a prospect became a customer.
 *
 * Nightly, and separate from the sweeps, because it is the one job here that
 * costs nothing and must not be skipped. Attribution is written once, when the
 * match is made - so a night it does not run is a night of signups that are
 * harder to attribute later, once somebody has changed their email or the
 * prospect row has been edited.
 *
 * It runs whether or not the Sales Centre is enabled. Turning outreach off
 * does not stop the people already emailed from signing up, and those are
 * exactly the signups worth attributing.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const started = Date.now();
  const outcome = await salesAttributionService.match('cron').catch((error) => ({
    created: 0,
    checked: 0,
    error: String(error).slice(0, 200),
  }));

  if ('created' in outcome && outcome.created > 0) {
    console.log(
      `[sales-attribution] matched=${outcome.created} of ${outcome.checked} customers` +
        ` in ${Date.now() - started}ms`,
    );
  }

  return NextResponse.json(outcome);
}
