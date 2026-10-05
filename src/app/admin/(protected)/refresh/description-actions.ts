'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import {
  advanceDescriptionRun,
  cancelDescriptionRun,
  liveDescriptionRun,
  startDescriptionRun,
  type RunProgress,
} from '@/lib/services/site-description-service';

/**
 * Starting, watching and stopping the description sweep.
 *
 * Starting it does the first slice as well, so pressing the button visibly
 * does something rather than only writing a row. Everything after that is the
 * cron's, which is what lets somebody start it and close the tab.
 *
 * It spends no money. The only cost is an HTTP request per domain, which is
 * why there is no budget guard here and a long one on the refresh beside it.
 */

export interface DescriptionActionResult {
  ok: boolean;
  message: string;
}

/**
 * A short first slice.
 *
 * Forty-five seconds, not the cron's four minutes: somebody is watching a
 * spinner, and the job carries on without them either way. Long enough that
 * the bar has moved by the time the page comes back.
 */
const FIRST_SLICE_MS = 45_000;

export async function startDescriptionRunAction(): Promise<DescriptionActionResult> {
  const session = await requireAdminSession();

  const started = await startDescriptionRun(session.email);
  if (!started.ok) return { ok: false, message: started.error ?? 'Could not start it.' };

  // Straight into the first slice. A failure here does not undo the run - the
  // cron picks it up within a few minutes regardless.
  try {
    await advanceDescriptionRun(FIRST_SLICE_MS);
  } catch {
    // Reported by the progress row, not by throwing at somebody who has just
    // successfully started a job.
  }

  revalidatePath('/admin/refresh');
  return {
    ok: true,
    message: 'Started. It carries on in the background - you can close this page.',
  };
}

export async function stopDescriptionRunAction(): Promise<DescriptionActionResult> {
  await requireAdminSession();
  await cancelDescriptionRun();

  revalidatePath('/admin/refresh');
  return { ok: true, message: 'Stopped. What it already filled in stays filled in.' };
}

/** Polled by the progress bar. Null when nothing is running. */
export async function descriptionProgressAction(): Promise<RunProgress | null> {
  await requireAdminSession();
  return liveDescriptionRun();
}
