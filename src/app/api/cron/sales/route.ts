import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { salesRunService } from '@/lib/services/sales-run-service';
import { advanceResearchSweep } from '@/lib/services/sales-research-service';
import { advanceQualifySweep } from '@/lib/services/sales-qualify-service';
import { salesContactService } from '@/lib/services/sales-contact-service';
import { salesEmailService } from '@/lib/services/sales-email-service';
import { salesFollowUpService } from '@/lib/services/sales-followup-service';

/**
 * Carrying the Sales Centre on after whoever started it has gone.
 *
 * This is the whole reason every sweep is a row rather than a button press. A
 * press lives as long as the request, and a request lives three hundred
 * seconds; crawling four hundred websites is an hour. So the press starts the
 * run and this finishes it, a slice at a time, whether or not anybody is
 * logged in.
 *
 * ## It starts nothing
 *
 * Every sweep here is advanced, never claimed. Research, qualification, a
 * Hunter lookup and an email are all things somebody decided to do, and a
 * nightly job that decided them on its own would spend money on a schedule
 * nobody set. The one exception is deliberate and is not here: sending
 * advances a run that a person approved emails into.
 *
 * It does nothing at all when no run is going, which is most of the time -
 * one small query per sweep and out.
 *
 * ## Why the budget is split
 *
 * Five sweeps share one function's three hundred seconds. Giving each a fixed
 * slice means a research sweep with four hundred sites left cannot starve the
 * sender, which is the one of the five with a person waiting on it.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Per sweep, leaving room to write the counters before the function ends. */
const SLICE_MS = 45_000;

function authorised(request: NextRequest): boolean {
  const secret = cronSecret();
  if (!secret) return false;

  // Identical whether the secret is missing or wrong.
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const started = Date.now();

  const settings = await salesSettingsService.get().catch(() => null);
  if (!settings?.enabled) {
    // Silent: a line every few minutes saying "off" buries the lines that
    // matter, and this feature ships off.
    return NextResponse.json({ skipped: 'The Sales Centre is off.' });
  }

  /*
    Sending first.

    It is the sweep with a person waiting on it - somebody approved those
    emails - and it is the cheapest, because its queue is already decided. A
    research sweep that fills the function and leaves the sender for the next
    tick delays approved email by five minutes for no reason.
  */
  const send = await salesEmailService.advanceSendRun(SLICE_MS).catch((error) => ({
    idle: true,
    sent: 0,
    failed: 0,
    wouldSend: 0,
    finished: false,
    outOfTime: false,
    reason: String(error).slice(0, 200),
  }));

  const research = await advanceResearchSweep(SLICE_MS).catch(() => null);
  const qualify = await advanceQualifySweep(SLICE_MS).catch(() => null);
  const contacts = await salesContactService.advanceSweep(SLICE_MS).catch(() => null);
  const followUps = await salesFollowUpService.advanceSweep(SLICE_MS).catch(() => null);

  /*
    Runs whose worker has gone.

    A run still marked running whose lease is clear or expired was being driven
    by a browser tab that closed, or by a function that was killed. The sweeps
    above pick up whatever is live, so this only logs - but a stalled run that
    nothing reports is a sweep that looks like it is working.
  */
  const stalled = await salesRunService.stalled().catch(() => []);

  const busy =
    !send.idle ||
    (research && !research.idle) ||
    (qualify && !qualify.idle) ||
    (contacts && !contacts.idle) ||
    (followUps && !followUps.idle);

  if (busy) {
    // Counts only. No addresses, no company names, no email bodies.
    console.log(
      `[sales] sent=${send.sent} sendFailed=${send.failed}` +
        ` researched=${research?.succeeded ?? 0} qualified=${qualify?.succeeded ?? 0}` +
        ` contacts=${contacts?.found ?? 0} followUps=${followUps?.drafted ?? 0}` +
        ` stalled=${stalled.length} in ${Date.now() - started}ms`,
    );
  }

  return NextResponse.json({
    send,
    research,
    qualify,
    contacts,
    followUps,
    stalled: stalled.length,
  });
}

/** Vercel Cron uses GET; POST is here so a sweep can be pushed along by hand. */
export const POST = GET;
