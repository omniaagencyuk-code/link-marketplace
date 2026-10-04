'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { linkMonitorAdmin, runDueChecks } from '@/lib/services/link-monitor-service';

/**
 * The two things an admin does to the monitor by hand.
 *
 * Closing a claim is the end of the manual refund: somebody has paid it in
 * Stripe and is recording that they did. Running a batch is for the first
 * day of a feature, when waiting until midnight to find out whether the
 * checker works is a poor way to spend an evening.
 */

export interface MonitorActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export async function closeClaimAction(claimId: string): Promise<MonitorActionResult> {
  await requireAdminSession();
  try {
    await linkMonitorAdmin.closeClaim(claimId);
    revalidatePath('/admin/link-monitor');
    return { ok: true, message: 'Claim closed.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not close it.' };
  }
}

export async function runChecksNowAction(): Promise<MonitorActionResult> {
  await requireAdminSession();
  try {
    // A small batch, because this one is waited on by a person in a browser
    // rather than by a cron with five minutes to spare.
    const outcome = await runDueChecks({ limit: 25, concurrency: 5, budgetMs: 45_000 });
    revalidatePath('/admin/link-monitor');
    return {
      ok: true,
      message:
        `Checked ${outcome.checked}: ${outcome.ok} fine, ${outcome.hard} failed, ` +
        `${outcome.soft} unreadable. ${outcome.lost} lost, ${outcome.restored} back.`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not run it.' };
  }
}
