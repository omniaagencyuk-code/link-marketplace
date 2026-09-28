import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { gmailImportService } from '@/lib/services/gmail-import-service';

/**
 * Tonight's import.
 *
 * Separate from the ten-minute sourcing cron because it is a different job on
 * a different clock: that one finishes work already started, this one starts
 * it. Sharing a route would mean one of the two carrying a condition about
 * what time it is, which is the kind of thing that silently stops firing.
 *
 * Off unless somebody switched it on, and it refuses to run twice in a day
 * even if this fires twice. Reading what it finds is a second switch, also
 * off, because that is the part that costs money.
 *
 * Refuses without the shared secret, like the other jobs that reach a paid
 * API or read a mailbox.
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
  const outcome = await gmailImportService
    .runNightly()
    .catch(() => ({ ran: false, message: 'The nightly import failed to start.' }));

  // Counts and reasons only. No addresses, no subjects, no bodies.
  console.log(`[gmail-nightly] ran=${outcome.ran} in ${Date.now() - started}ms`);

  return NextResponse.json(outcome);
}

/** Vercel Cron uses GET; POST is here so it can be triggered by hand. */
export const POST = GET;
