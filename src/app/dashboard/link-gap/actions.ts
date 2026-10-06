'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { gapService } from '@/lib/services/gap-service';

/**
 * Running a report, from the customer's side.
 *
 * `requireCustomerSession` first and without exception: a server action has
 * its own endpoint and is reachable without rendering a page, so the proxy
 * gating /dashboard is not the check that matters. The user id comes from
 * that session and never from the form - a run that trusted a posted id would
 * let anybody spend somebody else's allowance and read the result.
 */

export interface GapActionResult {
  ok: boolean;
  error?: string;
}

export async function runGapAction(formData: FormData): Promise<GapActionResult> {
  const user = await requireCustomerSession('/dashboard/link-gap');

  const target = String(formData.get('target') ?? '');
  const competitors = [
    String(formData.get('competitor1') ?? ''),
    String(formData.get('competitor2') ?? ''),
    String(formData.get('competitor3') ?? ''),
  ].filter((entry) => entry.trim().length > 0);

  let runId: string;

  try {
    const outcome = await gapService.run(user.id, target, competitors);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    runId = outcome.runId;
  } catch (error) {
    // Never the underlying message: it can carry an Ahrefs error, and an
    // Ahrefs error can carry our account's state.
    console.error('[gap] action failed:', String(error).slice(0, 200));
    return { ok: false, error: 'That report could not be run. Please try again.' };
  }

  revalidatePath('/dashboard/link-gap');
  redirect(`/dashboard/link-gap/${runId}`);
}
