import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { runMaintenance } from '@/lib/services/link-monitor-service';

/**
 * The daily tidy-up behind the guarantee.
 *
 * Half past six, so it runs after the night's last checking window has
 * closed: a claim handed to a buyer at six is a claim the checker might have
 * restored at five, and the durability scores should be computed from a
 * finished night rather than halfway through one.
 */

export const dynamic = 'force-dynamic';
// Recomputing the scores is one statement over every watched link, and moving
// claims sends an email each. Neither is slow, but the default would cut a
// busy night off part way through the claims.
export const maxDuration = 120;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;

  const header = request.headers.get('authorization');
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const outcome = await runMaintenance();

  console.log(
    `[link-maintenance] handedToBuyer=${outcome.handedToBuyer} scored=${outcome.scored}` +
      `${outcome.error ? ` error=${outcome.error}` : ''}`,
  );

  return NextResponse.json(outcome, { status: outcome.error ? 500 : 200 });
}
