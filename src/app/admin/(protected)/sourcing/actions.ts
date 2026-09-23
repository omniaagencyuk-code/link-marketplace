'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { sourcingService } from '@/lib/services/sourcing-service';
import { approveDraft, applyGeneralPriceToNiches } from '@/lib/services/draft-approval';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { extractedListingSchema, type ExtractedListing } from '@/lib/sourcing/schema';

/**
 * Everything the publisher inbox does, behind an admin session.
 *
 * Nothing here is reachable without one: `requireAdminSession()` is the first
 * line of every action, so an unauthenticated POST cannot upload a mailbox,
 * spend money on extraction, or read a publisher's address.
 */

async function reviewer(): Promise<string | undefined> {
  const session = await requireAdminSession();
  return session.email ?? undefined;
}

export async function updateSourcingSettingsAction(patch: {
  enabled?: boolean;
  mode?: 'realtime' | 'batch';
  model?: string;
  monthlyBudgetUsd?: number;
}) {
  const by = await reviewer();
  await sourcingService.updateSettings(patch, by);
  revalidatePath('/admin/sourcing');
  return { ok: true };
}

export async function ingestMboxAction(form: FormData) {
  await requireAdminSession();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose an .mbox file to upload.' };
  }
  // Generous but finite: a year of one mailbox is a few tens of megabytes,
  // and an unbounded read is how a server route runs out of memory.
  if (file.size > 80 * 1024 * 1024) {
    return { ok: false, error: `That file is ${(file.size / 1024 / 1024).toFixed(0)}MB. The limit is 80MB.` };
  }

  try {
    const result = await sourcingService.ingestMbox(await file.text());
    revalidatePath('/admin/sourcing');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read that file.' };
  }
}

export async function ingestPastedAction(raw: string, fromAddress?: string) {
  await requireAdminSession();
  if (!raw.trim()) return { ok: false, error: 'Paste the email first.' };

  try {
    const result = await sourcingService.ingestPasted(raw, fromAddress);
    revalidatePath('/admin/sourcing');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read that email.' };
  }
}

export async function runExtractionAction(options: { limit?: number; dryRun?: boolean }) {
  const by = await reviewer();
  const result = await sourcingService.runExtraction({ ...options, submittedBy: by });
  revalidatePath('/admin/sourcing');
  return result;
}

export async function collectBatchesAction() {
  await requireAdminSession();
  const result = await sourcingService.collectBatches();
  revalidatePath('/admin/sourcing');
  return result;
}

/**
 * Approve, with whatever the reviewer edited.
 *
 * The edited values are validated against the same schema the model's output
 * is, so a hand-edited field cannot put a shape into the database that
 * extraction never could.
 */
export async function approveDraftAction(draftId: string, edited: unknown) {
  const by = await reviewer();
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, values, status')
    .eq('id', draftId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'That draft no longer exists.' };
  const draft = data as Record<string, unknown>;
  if (draft.status !== 'pending') {
    return { ok: false, error: 'That draft has already been reviewed.' };
  }

  const parsed = extractedListingSchema.safeParse(edited ?? draft.values);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Those values are not valid: ${parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    };
  }

  try {
    const result = await approveDraft(draftId, parsed.data, {
      domain: String(draft.domain),
      matchedWebsiteId: (draft.matched_website_id as string | null) ?? null,
      emailId: String(draft.email_id),
      reviewer: by,
    });
    revalidatePath('/admin/sourcing');
    revalidatePath('/admin/websites');
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not approve that draft.' };
  }
}

export async function rejectDraftAction(draftId: string, reason: string) {
  const by = await reviewer();
  const supabase = getAdminScopedClient();

  await supabase
    .from('listing_drafts')
    .update({
      status: 'rejected',
      reject_reason: reason.trim() || 'No reason given.',
      reviewed_by: by ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', draftId)
    .eq('status', 'pending');

  revalidatePath('/admin/sourcing');
  return { ok: true };
}

/**
 * Approve everything the model was sure about.
 *
 * Only drafts with no low-confidence field and no reviewer flag: a draft
 * carrying "single price, confirm niches" is precisely the one a human has to
 * look at, so it is never swept up by a bulk action.
 */
export async function bulkApproveConfidentAction() {
  const by = await reviewer();
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, values')
    .eq('status', 'pending')
    .eq('low_confidence_count', 0)
    .eq('flags', '{}')
    .limit(100);

  const drafts = (data ?? []) as Record<string, unknown>[];
  let approved = 0;
  const failures: string[] = [];

  for (const draft of drafts) {
    const parsed = extractedListingSchema.safeParse(draft.values);
    if (!parsed.success) {
      failures.push(String(draft.domain));
      continue;
    }
    try {
      await approveDraft(String(draft.id), parsed.data, {
        domain: String(draft.domain),
        matchedWebsiteId: (draft.matched_website_id as string | null) ?? null,
        emailId: String(draft.email_id),
        reviewer: by,
      });
      approved += 1;
    } catch {
      failures.push(String(draft.domain));
    }
  }

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/websites');
  return { ok: true, approved, failures };
}

/** The "apply the general price to every niche" button, as a reviewer action. */
export async function spreadGeneralPriceAction(values: unknown): Promise<{
  ok: boolean;
  values?: ExtractedListing;
  error?: string;
}> {
  await requireAdminSession();
  const parsed = extractedListingSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: 'Those values are not valid.' };
  return { ok: true, values: applyGeneralPriceToNiches(parsed.data) };
}
