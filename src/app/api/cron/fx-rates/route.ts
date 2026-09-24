import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { fxService } from '@/lib/services/fx-service';
import { pricingService } from '@/lib/services/pricing-service';

/**
 * The daily exchange rate fetch.
 *
 * Called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`, the same
 * secret the Ahrefs job uses. Unlike that one this costs nothing to run, but
 * it is still refused without a secret: it writes the numbers every price is
 * calculated from, and an open URL that can move every price on the
 * marketplace is not something to leave to obscurity.
 *
 * A rate that moved more than the threshold reprices everything that depends
 * on it. A quiet day writes the rates and stops - there is no point pushing
 * three hundred listings through the engine to arrive at the same prices.
 */

export const dynamic = 'force-dynamic';

// Fetching is quick; the repricing that can follow it is not.
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
  const refreshed = await fxService.refresh();

  if (refreshed.error) {
    console.error(`[fx] failed after ${Date.now() - started}ms: ${refreshed.error}`);
    // A 500 so the failure shows in Vercel's cron history rather than
    // reading as a successful run that happened to do nothing.
    return NextResponse.json({ error: refreshed.error }, { status: 500 });
  }

  let repriced: Awaited<ReturnType<typeof pricingService.apply>> | null = null;
  if (refreshed.moved.length > 0) {
    repriced = await pricingService.apply();
  }

  const moved = refreshed.moved
    .map((entry) => `${entry.currency} ${entry.movedPct.toFixed(1)}%`)
    .join(', ');

  console.log(
    `[fx] ${refreshed.updated} rates in ${Date.now() - started}ms` +
      (moved ? `; moved: ${moved}; repriced ${repriced?.priced ?? 0}` : '; nothing moved enough to reprice'),
  );

  return NextResponse.json({
    updated: refreshed.updated,
    moved: refreshed.moved,
    repriced: repriced?.priced ?? 0,
  });
}
