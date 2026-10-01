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
  /*
    This receives one batch, not a whole export.

    The admin splits an export in the browser and posts it in pieces, because
    a Server Action's request body is capped far below the size of a year's
    mail - and when it is exceeded the browser reports "page couldn't load",
    which names neither the limit nor the cause.

    The guard here used to say 80MB, which was never reachable: the request
    died at 1MB before this function ran. It now describes the real limit, so
    a batch that somehow arrives too large says something true.
  */
  if (file.size > 4 * 1024 * 1024) {
    return {
      ok: false,
      error:
        `That upload is ${(file.size / 1024 / 1024).toFixed(1)}MB and the per-request limit is 4MB. ` +
        'Exports are normally split automatically - if you are seeing this, tell us.',
    };
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

/**
 * Approve a chosen set, each with its own values.
 *
 * Between "everything from this email" and "everything nothing is flagged
 * on" there is the ordinary case: these eleven, because I have read them and
 * they are right. Nothing is copied between them - each draft is approved as
 * it stands, so a site priced differently stays priced differently.
 */
export async function approveSelectedAction(draftIds: string[]) {
  const by = await reviewer();
  if (draftIds.length === 0) return { ok: true, approved: 0, failures: [] as string[] };

  const supabase = getAdminScopedClient();
  const { data } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, proposed')
    .in('id', draftIds.slice(0, 500))
    .eq('status', 'pending');

  let approved = 0;
  const failures: string[] = [];

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const parsed = extractedListingSchema.safeParse(row.proposed);
    if (!parsed.success) {
      failures.push(String(row.domain));
      continue;
    }
    try {
      await approveDraft(String(row.id), parsed.data, {
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

/**
 * Delete drafts outright.
 *
 * Distinct from rejecting one, which keeps the row and its reason because
 * somebody looked at it and decided. This is for drafts that should never
 * have been there - a reply read twice, a network expanded before the rules
 * were right - where fifty-eight rejection records would be noise rather
 * than history.
 *
 * Only pending drafts go. An approved one is a listing now, and deleting the
 * draft behind it would not remove the listing anyway.
 */
export async function discardDraftsAction(draftIds: string[]) {
  await requireAdminSession();
  if (draftIds.length === 0) return { ok: true, discarded: 0 };

  const supabase = getAdminScopedClient();
  const { data, error } = await supabase
    .from('listing_drafts')
    .delete()
    .in('id', draftIds.slice(0, 500))
    .eq('status', 'pending')
    .select('id');

  if (error) return { ok: false, error: error.message, discarded: 0 };

  revalidatePath('/admin/sourcing');
  return { ok: true, discarded: (data ?? []).length };
}

/**
 * Settle a contested domain in one click: approve one offer, drop the rest.
 *
 * The duplicates page used to be able to do half of this. You could delete
 * the copies you did not want, one confirm each, and then go and find the
 * one you did want on its own page and approve it there. For a domain
 * offered seven times by the same reseller that is seven interactions to
 * reach a decision that was never in doubt, and the screenshot that prompted
 * this had a domain already approved sitting above six identical drafts
 * nobody had got round to clearing.
 *
 * Approving first is the whole of the safety here. If the approval throws,
 * nothing is deleted and the domain is exactly as it was - whereas clearing
 * first and approving second would, on a bad day, leave no drafts and no
 * listing.
 *
 * The domain is re-read from the winning draft rather than taken from the
 * caller, so the delete cannot be pointed at a domain the reviewer was not
 * looking at. Only pending rows go, so a draft approved from another tab
 * between the page rendering and this running is left alone.
 */
/**
 * One contested domain, settled: approve the chosen offer, clear the rest.
 *
 * The body of both the single-domain button and the bulk one, so there is one
 * place where the order of the two steps is decided and one place to check it.
 *
 * Approving first is the whole of the safety. If the approval throws, nothing
 * is deleted and the domain is exactly as it was - whereas clearing first and
 * approving second would, on a bad day, leave no drafts and no listing.
 *
 * The domain is re-read from the winning draft rather than taken from the
 * caller, so the delete cannot be pointed at a domain the reviewer was not
 * looking at. Only pending rows go, so a draft approved from another tab
 * between the page rendering and this running is left alone.
 */
async function settleContested(
  keepDraftId: string,
  by: string | undefined,
): Promise<{ ok: true; domain: string; cleared: number; warning: string | null } | { ok: false; error: string }> {
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, proposed, status')
    .eq('id', keepDraftId)
    .maybeSingle();

  if (!data) return { ok: false, error: 'That draft no longer exists.' };
  const draft = data as Record<string, unknown>;
  if (draft.status !== 'pending') {
    return { ok: false, error: 'That draft has already been reviewed.' };
  }

  const parsed = extractedListingSchema.safeParse(draft.proposed);
  if (!parsed.success) {
    return { ok: false, error: 'That draft cannot be approved from here - open it and fix the values first.' };
  }

  const domain = String(draft.domain);

  try {
    await approveDraft(keepDraftId, parsed.data, {
      domain,
      matchedWebsiteId: (draft.matched_website_id as string | null) ?? null,
      emailId: String(draft.email_id),
      reviewer: by,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not approve that draft.' };
  }

  // Everything else still waiting on this domain. A failure here is worth
  // reporting but not worth undoing the approval over: the listing is
  // correct, and the leftovers can be cleared again.
  const { data: cleared, error } = await supabase
    .from('listing_drafts')
    .delete()
    .eq('domain', domain)
    .eq('status', 'pending')
    .neq('id', keepDraftId)
    .select('id');

  return {
    ok: true,
    domain,
    cleared: (cleared ?? []).length,
    warning: error ? `Approved, but the other drafts are still there: ${error.message}` : null,
  };
}

/** Clear every draft waiting on these domains, touching nothing we sell. */
async function clearContested(domains: string[]): Promise<{ cleared: number; error: string | null }> {
  const wanted = domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean);
  if (wanted.length === 0) return { cleared: 0, error: null };

  const supabase = getAdminScopedClient();
  const { data, error } = await supabase
    .from('listing_drafts')
    .delete()
    .in('domain', wanted)
    .eq('status', 'pending')
    .select('id');

  return { cleared: (data ?? []).length, error: error ? error.message : null };
}

/** Settle one contested domain from its own row. */
export async function resolveDuplicateAction(keepDraftId: string) {
  const by = await reviewer();
  const outcome = await settleContested(keepDraftId, by);

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/sourcing/duplicates');
  revalidatePath('/admin/websites');
  return outcome;
}

/**
 * Settle a batch of them, one chosen draft per domain.
 *
 * The browser sends these in chunks and waits for each answer, the same way
 * the review queue does, because an approval is around ten sequential round
 * trips and two hundred of them in one request runs past the function
 * ceiling with nobody left to tell.
 *
 * Each domain is settled on its own terms. One that cannot be approved is
 * named and the rest carry on, rather than a single bad draft taking down a
 * batch somebody has just spent a minute ticking.
 */
export async function resolveDuplicatesAction(keepDraftIds: string[]) {
  const by = await reviewer();
  if (keepDraftIds.length === 0) return { ok: true as const, approved: 0, cleared: 0, failures: [] as string[] };

  let approved = 0;
  let cleared = 0;
  const failures: string[] = [];

  for (const id of keepDraftIds.slice(0, 100)) {
    const outcome = await settleContested(id, by);
    if (outcome.ok) {
      approved += 1;
      cleared += outcome.cleared;
    } else {
      failures.push(outcome.error);
    }
  }

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/sourcing/duplicates');
  revalidatePath('/admin/websites');
  return { ok: true as const, approved, cleared, failures };
}

/**
 * Clear a batch of domains without changing anything we sell.
 *
 * The common case on this page by a wide margin: a domain already in the
 * marketplace at a price somebody checked, with a reseller mailing the same
 * list again. None of those drafts is wrong and none is worth approving,
 * because approving one writes its contact and cost over a listing that is
 * already right.
 *
 * It goes nowhere near `approveDraft`, which remains the only way anything
 * extracted reaches a listing, and the emails stay where they are.
 */
export async function leaveDomainsAsIsAction(domains: string[]) {
  await requireAdminSession();
  if (domains.length === 0) return { ok: true as const, cleared: 0 };

  const { cleared, error } = await clearContested(domains.slice(0, 200));
  if (error) return { ok: false as const, error, cleared: 0 };

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/sourcing/duplicates');
  return { ok: true as const, cleared };
}

export async function leaveDomainAsIsAction(domain: string) {
  await requireAdminSession();

  const { cleared, error } = await clearContested([domain]);
  if (error) return { ok: false as const, error, cleared: 0 };

  revalidatePath('/admin/sourcing');
  revalidatePath('/admin/sourcing/duplicates');
  return { ok: true as const, cleared };
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
 *
 * The browser names the drafts and sends them a chunk at a time, because two
 * hundred approvals in one request runs past the function ceiling and
 * answers nothing. Naming them does not mean trusting the list: every
 * condition is re-checked here against the row as it stands now, so a draft
 * that has been flagged, reviewed or contested since the page was rendered
 * is skipped rather than approved on the strength of a stale screen.
 *
 * Contested domains are the reason that matters. Their flag is worked out
 * when the page renders rather than stored on the row, so the filter on
 * `flags` below cannot see it - and approving one of two offers overwrites
 * the other's price and contact with nobody looking.
 */
export async function bulkApproveConfidentAction(draftIds: string[]) {
  const by = await reviewer();
  if (draftIds.length === 0) return { ok: true, approved: 0, failures: [] as string[], skipped: 0 };

  const supabase = getAdminScopedClient();

  const [{ data }, contested] = await Promise.all([
    supabase
      .from('listing_drafts')
      .select('id, domain, email_id, matched_website_id, proposed, flags')
      .in('id', draftIds.slice(0, 100))
      .eq('status', 'pending')
      .eq('low_confidence_count', 0),
    sourcingService.domainsWithCompetingOffers().catch(() => new Set<string>()),
  ]);

  // The flag filter is applied here rather than in the query. Comparing a
  // text[] column to an empty array through PostgREST is fiddly enough to get
  // subtly wrong, and getting it wrong in this direction would bulk-approve
  // the flagged drafts this action exists to leave alone.
  const drafts = ((data ?? []) as Record<string, unknown>[]).filter(
    (draft) =>
      ((draft.flags as string[] | null) ?? []).length === 0 &&
      !contested.has(String(draft.domain)),
  );
  const skipped = draftIds.length - drafts.length;
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
  return { ok: true, approved, failures, skipped };
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

/**
 * The rate-card worklist.
 *
 * Both actions are ordinary admin actions on an email that already exists.
 * Neither fetches a URL and neither downloads an attachment: the only thing
 * that crosses into the system here is text a human pasted after reading the
 * rate card themselves.
 */
export async function addRateCardAction(input: { emailId: string; text: string }) {
  const by = await reviewer();
  const result = await sourcingService.addRateCard(input.emailId, input.text, by);
  revalidatePath('/admin/sourcing/no-drafts');
  revalidatePath('/admin/sourcing');
  return result;
}

/** Added to the marketplace by hand, and recorded as such. */
export async function markHandledAction(emailId: string) {
  const by = await reviewer();
  await sourcingService.markNoDraftHandled(emailId, by);
  revalidatePath('/admin/sourcing/no-drafts');
  revalidatePath('/admin/sourcing');
  return { ok: true };
}

/** Nothing worth having. It leaves the list. */
export async function dismissNoDraftAction(emailId: string) {
  await requireAdminSession();
  await sourcingService.dismissNoDraft(emailId);
  revalidatePath('/admin/sourcing/no-drafts');
  revalidatePath('/admin/sourcing');
  return { ok: true };
}

/**
 * Give up on outstanding batches and put their emails back.
 *
 * Destructive only of a claim, never of an email: the rows return to 'new'
 * exactly as they arrived. Offered because a batch that is never coming back
 * is otherwise indistinguishable from one that is nearly done, and waiting
 * for ever is not a state anybody should be stuck in.
 */
export async function releaseStuckAction() {
  await requireAdminSession();
  const result = await sourcingService.releaseStuckBatches();
  revalidatePath('/admin/sourcing');
  return result;
}
