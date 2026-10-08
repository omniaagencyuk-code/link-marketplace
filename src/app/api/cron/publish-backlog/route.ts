import { NextResponse, type NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { advancePublishRun } from '@/lib/services/website-publish-run';

/**
 * Carries a publish run on while there is one.
 *
 * Does nothing at all when no run is going: `claim_website_publish_run`
 * returns nothing and this returns immediately, so the schedule costs nothing
 * on the days nobody is publishing anything.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 240_000;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const outcome = await advancePublishRun(BUDGET_MS);
  return NextResponse.json(outcome);
}

export const POST = GET;
