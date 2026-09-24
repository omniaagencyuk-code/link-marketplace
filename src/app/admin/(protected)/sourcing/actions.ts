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

/**
 * Put failed emails back in the queue.
 *
 * Extraction only ever reads rows marked 'new', so a failure is otherwise a
 * dead end: the email sits there with its reason and no button can reach it.
 * Ignored emails are deliberately not included - "nothing usable in this
 * one" is a finished answer, not a stuck job.
 */
export async function retryFailedAction() {
  await requireAdminSession();
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('inbound_emails')
    .update({ status: 'new', status_reason: null, batch_id: null })
    .eq('status', 'failed')
    .select('id');

  revalidatePath('/admin/sourcing');
  const count = (data ?? []).length;
  return { ok: true, count };
}

/**
 * Read an email again under the current rules.
 *
 * The extraction rules change - a rule is wrong, a case nobody had seen turns
 * up - and drafts made under the old ones are stuck: extraction only reads
 * emails marked 'new', so an already-read email had no way back. Every draft
 * records the rules version it was made under, which is only useful if there
 * is something to do about it.
 *
 * Its pending drafts go first. An approved one is a listing now and is left
 * alone; a rejected one stays rejected, because re-reading is not a way to
 * quietly undo somebody's decision.
 */
export async function rereadEmailAction(emailId: string) {
  await requireAdminSession();
  const supabase = getAdminScopedClient();

  await supabase.from('listing_drafts').delete().eq('email_id', emailId).eq('status', 'pending');
  await supabase
    .from('inbound_emails')
    .update({ status: 'new', status_reason: null, batch_id: null, extracted_at: null })
    .eq('id', emailId);

  revalidatePath('/admin/sourcing');
  return { ok: true };
}

/** Put every already-read email back in the queue, under the current rules. */
export async function rereadAllAction() {
  await requireAdminSession();
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('inbound_emails')
    .select('id')
    .in('status', ['extracted', 'ignored']);

  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) return { ok: true, count: 0 };

  await supabase.from('listing_drafts').delete().in('email_id', ids).eq('status', 'pending');
  await supabase
    .from('inbound_emails')
    .update({ status: 'new', status_reason: null, batch_id: null, extracted_at: null })
    .in('id', ids);

  revalidatePath('/admin/sourcing');
  return { ok: true, count: ids.length };
}

/**
 * Throw an email away, with everything it produced.
 *
 * The same reply arrives twice - pasted once with headers and once without,
 * or forwarded by two people - and each copy becomes its own set of drafts.
 * Approving both is harmless now that approval re-checks the domain, but it
 * means working through the same sixty listings a second time for nothing.
 *
 * The email is kept and marked ignored rather than deleted, so a later
 * upload of the same export does not quietly bring it back: dedupe is on
 * Message-ID, and a row that is gone no longer dedupes anything.
 */
export async function discardEmailAction(emailId: string, reason?: string) {
  const by = await reviewer();
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('listing_drafts')
    .delete()
    .eq('email_id', emailId)
    .eq('status', 'pending')
    .select('id');

  await supabase
    .from('inbound_emails')
    .update({
      status: 'ignored',
      status_reason: reason?.trim()
        ? `Discarded: ${reason.trim()}`
        : `Discarded by ${by ?? 'an admin'}`,
    })
    .eq('id', emailId);

  revalidatePath('/admin/sourcing');
  return { ok: true, discarded: (data ?? []).length };
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
    .select('id, domain, email_id, matched_website_id, proposed, status')
    .eq('id', draftId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'That draft no longer exists.' };
  const draft = data as Record<string, unknown>;
  if (draft.status !== 'pending') {
    return { ok: false, error: 'That draft has already been reviewed.' };
  }

  const parsed = extractedListingSchema.safeParse(edited ?? draft.proposed);
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
    .select('id, domain, email_id, matched_website_id, proposed, flags')
    .eq('status', 'pending')
    .eq('low_confidence_count', 0)
    .limit(100);

  // The flag filter is applied here rather than in the query. Comparing a
  // text[] column to an empty array through PostgREST is fiddly enough to get
  // subtly wrong, and getting it wrong in this direction would bulk-approve
  // the flagged drafts this action exists to leave alone.
  const drafts = ((data ?? []) as Record<string, unknown>[]).filter(
    (draft) => ((draft.flags as string[] | null) ?? []).length === 0,
  );
  let approved = 0;
  const failures: string[] = [];

  for (const draft of drafts) {
    const parsed = extractedListingSchema.safeParse(draft.proposed);
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

/**
 * Approve this draft and every other one from the same email.
 *
 * The network case: sixty portals, one set of terms, one reviewer who has
 * just satisfied themselves that the reading is right. Each sibling is
 * approved with its OWN stored values, so an exception - the one site priced
 * differently, or the one that refuses gambling - is approved as itself and
 * not flattened into the network's terms.
 *
 * `applyEdits` carries the reviewer's corrections across, but only where a
 * sibling still holds the same value this draft had before the edit. A
 * correction to a price the whole network shares reaches all of them; the
 * same correction leaves the site that was always quoted differently alone.
 * That rule is what makes the button safe to press on sixty listings.
 */
export async function approveEmailBatchAction(
  draftId: string,
  edited: unknown,
  applyEdits: boolean,
) {
  const by = await reviewer();
  const supabase = getAdminScopedClient();

  const { data: current } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, proposed, status')
    .eq('id', draftId)
    .maybeSingle();

  if (!current) return { ok: false, error: 'That draft no longer exists.' };
  const draft = current as Record<string, unknown>;

  const parsedEdited = extractedListingSchema.safeParse(edited ?? draft.proposed);
  if (!parsedEdited.success) return { ok: false, error: 'Those values are not valid.' };

  const before = extractedListingSchema.safeParse(draft.proposed);
  const changed =
    applyEdits && before.success ? changedFields(before.data, parsedEdited.data) : new Map();

  const { data: rest } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, proposed')
    .eq('email_id', String(draft.email_id))
    .eq('status', 'pending')
    .neq('id', draftId);

  let approved = 0;
  const failures: string[] = [];

  // This one first, with the reviewer's edits exactly as they left them.
  if (draft.status === 'pending') {
    try {
      await approveDraft(draftId, parsedEdited.data, {
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

  for (const row of (rest ?? []) as Record<string, unknown>[]) {
    const parsed = extractedListingSchema.safeParse(row.proposed);
    if (!parsed.success) {
      failures.push(String(row.domain));
      continue;
    }

    const values = applyCorrections(parsed.data, changed, before.success ? before.data : null);

    try {
      await approveDraft(String(row.id), values, {
        domain: String(row.domain),
        matchedWebsiteId: (row.matched_website_id as string | null) ?? null,
        emailId: String(row.email_id),
        reviewer: by,
      });
      approved += 1;
    } catch {
      failures.push(String(row.domain));
    }
  }

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/websites');
  return { ok: true, approved, failures };
}

/** Top-level fields the reviewer actually changed, and what they changed to. */
function changedFields(before: ExtractedListing, after: ExtractedListing): Map<string, unknown> {
  const changed = new Map<string, unknown>();
  for (const key of Object.keys(after) as (keyof ExtractedListing)[]) {
    // Per-domain by nature, and never shared across a network.
    if (key === 'domain' || key === 'also_applies_to' || key === 'confidence' || key === 'evidence') {
      continue;
    }
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.set(key, after[key]);
    }
  }
  return changed;
}

/** A correction reaches a sibling only where the sibling still agrees. */
function applyCorrections(
  sibling: ExtractedListing,
  changed: Map<string, unknown>,
  before: ExtractedListing | null,
): ExtractedListing {
  if (!before || changed.size === 0) return sibling;

  const next = { ...sibling } as Record<string, unknown>;
  for (const [key, value] of changed) {
    const original = (before as Record<string, unknown>)[key];
    if (JSON.stringify(next[key]) === JSON.stringify(original)) next[key] = value;
  }
  return next as ExtractedListing;
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
