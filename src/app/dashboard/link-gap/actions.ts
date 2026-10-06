'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { gapService } from '@/lib/services/gap-service';
import type { Suggestion } from '@/lib/gap/competitors';

/**
 * The customer's side of the gap finder.
 *
 * `requireCustomerSession` first in every action here and without exception: a
 * server action has its own endpoint and is reachable without rendering a
 * page, so the proxy gating /dashboard is not the check that matters. The user
 * id comes from that session and never from the form - an action that trusted
 * a posted id would let anybody spend somebody else's allowance, read their
 * reports, or rewrite their saved sites.
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

  const projectId = String(formData.get('projectId') ?? '').trim() || undefined;

  let runId: string;

  try {
    const outcome = await gapService.run(user.id, target, competitors, projectId);
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

export interface SuggestActionResult {
  ok: boolean;
  error?: string;
  suggestions?: Suggestion[];
  /** True when the list came from the cache, so it cost nothing. */
  cached?: boolean;
}

/**
 * Fill in the competitor boxes from Ahrefs.
 *
 * Returns the suggestions rather than applying them. The customer confirms or
 * edits what comes back before any report runs, which is the whole shape of
 * this feature: a fifty-unit lookup proposes, a person decides, and only then
 * does anything cost 2,500 a target.
 */
export async function suggestCompetitorsAction(formData: FormData): Promise<SuggestActionResult> {
  const user = await requireCustomerSession('/dashboard/link-gap');

  const domain = String(formData.get('target') ?? '');
  const country = String(formData.get('country') ?? 'gb');

  try {
    const outcome = await gapService.suggestCompetitors(user.id, domain, country);
    if (!outcome.ok) return { ok: false, error: outcome.error };
    return { ok: true, suggestions: outcome.suggestions, cached: outcome.cached };
  } catch (error) {
    console.error('[gap] suggest failed:', String(error).slice(0, 200));
    return { ok: false, error: 'We could not look up competitors just now. Add them by hand.' };
  }
}

export async function saveProjectAction(formData: FormData): Promise<GapActionResult> {
  const user = await requireCustomerSession('/dashboard/link-gap');

  const outcome = await gapService.saveProject(user.id, {
    id: String(formData.get('projectId') ?? '').trim() || undefined,
    name: String(formData.get('name') ?? ''),
    domain: String(formData.get('target') ?? ''),
    competitors: [
      String(formData.get('competitor1') ?? ''),
      String(formData.get('competitor2') ?? ''),
      String(formData.get('competitor3') ?? ''),
    ],
    country: String(formData.get('country') ?? 'gb'),
  });

  if (!outcome.ok) return { ok: false, error: outcome.error };

  revalidatePath('/dashboard/link-gap');
  return { ok: true };
}

export async function deleteProjectAction(projectId: string): Promise<GapActionResult> {
  const user = await requireCustomerSession('/dashboard/link-gap');

  const removed = await gapService.deleteProject(user.id, projectId);
  if (!removed) return { ok: false, error: 'Could not remove that site.' };

  revalidatePath('/dashboard/link-gap');
  return { ok: true };
}
