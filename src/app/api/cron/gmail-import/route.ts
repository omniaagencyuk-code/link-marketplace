import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cronSecret } from '@/lib/ahrefs/config';
import { gmailImportService } from '@/lib/services/gmail-import-service';

/**
 * Finishing imports nobody is watching.
 *
 * The admin page drives its own job chunk by chunk while it is open. This is
 * what happens when it is not: a job still fetching, with nobody holding its
 * lease, is picked up here and pushed along. Without it, closing the tab
 * would strand a half-imported backlog in a state that looks like progress.
 *
 * It fetches mail, so it refuses to run without the shared cron secret - the
 * same rule the Ahrefs refresh follows, and for the same reason: an open URL
 * that reads mailboxes is not something to leave to obscurity.
 *
 * Bounded on purpose. Three jobs, ten chunks each, so the invocation ends
 * well inside its limit and the next run picks up whatever is left.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_JOBS = 3;
const CHUNKS_PER_JOB = 10;

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
  const jobIds = await gmailImportService.stalledJobs(MAX_JOBS).catch(() => []);
  const results: { jobId: string; chunks: number; done: boolean }[] = [];

  for (const jobId of jobIds) {
    try {
      const outcome = await gmailImportService.drain(jobId, CHUNKS_PER_JOB);
      results.push({ jobId, ...outcome });
    } catch {
      // One bad job must not stop the others, and the reason is already on
      // the job row. Nothing about a mailbox or a message goes to the log.
      results.push({ jobId, chunks: 0, done: false });
    }
  }

  // Counts only. No addresses, no subjects, no bodies.
  console.log(
    `[gmail-import] jobs=${results.length} finished=${results.filter((r) => r.done).length}` +
      ` in ${Date.now() - started}ms`,
  );

  return NextResponse.json({ jobs: results.length, results });
}

/** Vercel Cron uses GET; POST is here so a job can be pushed along by hand. */
export const POST = GET;
