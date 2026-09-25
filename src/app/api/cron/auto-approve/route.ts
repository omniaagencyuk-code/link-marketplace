import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { deliveryService } from '@/lib/services/delivery-service';

/**
 * Turn silence into consent, once a day.
 *
 * A customer gets a fixed window to look at a delivered placement. After it,
 * the order closes on its own - otherwise every customer who is simply busy
 * leaves an order open for ever, and we never know which placements were
 * actually fine.
 *
 * What it writes down matters as much as what it does: an item approved here
 * is marked as approved by the clock, not by the customer. If a placement is
 * ever argued about, "they never replied" is the honest answer and it must
 * not read as "they said yes".
 *
 * It also sends the warning that precedes all this, a few days out, because
 * the two belong in one job: warning and settling must never get out of
 * order, and a separate schedule is a second thing that can fail to run.
 *
 * Refuses to run at all with no secret configured, the same as the Ahrefs
 * job. This one spends no money, but it does settle other people's orders.
 */

export const dynamic = 'force-dynamic';

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

  // Warn first, settle second, in that order and in the same job. Reversed,
  // a placement could be auto-approved in the morning and warned about it in
  // the afternoon - and a warning that arrives after the deadline is worse
  // than none, because it reads as a mistake we made rather than a courtesy.
  const { reminded } = await deliveryService.sendApprovalReminders();
  const { approved } = await deliveryService.autoApproveDue();

  console.log(
    `[auto-approve] ${reminded} reminded, ${approved} approved by the clock in ${Date.now() - started}ms`,
  );

  return NextResponse.json({ reminded, approved });
}

/** Vercel Cron uses GET; POST is here so it can be triggered by hand. */
export const POST = GET;
