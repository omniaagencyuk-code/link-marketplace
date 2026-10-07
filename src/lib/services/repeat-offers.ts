/**
 * One seller, the same site, over and over.
 *
 * The duplicates queue was built for a real decision: a publisher answers and
 * so does a reseller who has that publisher in their portfolio, two prices
 * arrive, and a person picks. That decision is worth a card.
 *
 * Most of the queue is not that. It is one reseller mailing the same list
 * every fortnight - four drafts on one domain, one company, one price,
 * sometimes from two addresses at that company and sometimes from the same
 * address four times. Nothing is being decided there, and the only way to
 * find that out was to open all four.
 *
 * So the repeats are settled without being read:
 *
 * - **A repeat is deleted.** The same seller already offers this site at that
 *   price or less, on a draft we are keeping or on a listing already
 *   approved. The reply itself stays in `inbound_emails`, as every reply
 *   does, so nothing is actually lost.
 * - **An undercut is approved.** The same seller now wants strictly less than
 *   the offer of theirs we approved. There is no version of that we would
 *   refuse, so it goes through the ordinary approval path and replaces what
 *   is on the listing.
 * - **Everything else is left alone**, which is the half that keeps this
 *   safe. A seller we have not approved for this site, two different sellers
 *   at any prices, a figure that cannot be converted, an undercut steep
 *   enough to look like a misreading - all still go to a person.
 *
 * `resolveRepeats` in `lib/sourcing/offers.ts` decides all of that and reads
 * nothing; this reads the drafts, applies the verdicts and counts them.
 *
 * ## Why an approval happens here without a human pressing Approve
 *
 * It is the one exception to the rule the rest of this system is arranged
 * around, and it is narrow on purpose: the same company, the same site, a
 * lower number than the one we already accepted from them, converted on both
 * sides, and not so much lower that it reads as a misreading. It still goes
 * through `approveDraft`, which remains the only path anything extracted
 * takes to a listing - what is skipped is a person pressing the button, not
 * any of the checking that button does.
 */
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { approveDraft } from '@/lib/services/draft-approval';
import { fxService } from '@/lib/services/fx-service';
import { sourcingService } from '@/lib/services/sourcing-service';
import { readBlockTarget } from '@/lib/sourcing/blocklist';
import { rankOffers, resolveRepeats, type RepeatVerdict } from '@/lib/sourcing/offers';
import { extractedListingSchema } from '@/lib/sourcing/schema';

/**
 * Drafts per delete. One statement each, so these go in bulk - but a URL
 * carries the ids, and a few thousand of them in one `in(...)` is a request
 * no proxy will take.
 */
const DELETE_CHUNK = 200;

/**
 * Undercuts per sweep.
 *
 * An approval is around ten sequential round trips; a delete of two hundred
 * drafts is one. So the deletions are unbounded and the approvals are not,
 * and a sweep that finds more than this many comes back saying so rather than
 * running past the function ceiling with nobody left to tell.
 *
 * Ten because that is the number the duplicates page already sends per
 * request and has been proved to survive. Undercuts are rare - the same
 * company lowering a price they already quoted us - so a sweep that has to be
 * run twice is a sweep that found something unusual.
 */
const APPROVE_PER_SWEEP = 10;

export interface RepeatPlan {
  /** Contested domains the sweep found anything to do on. */
  domains: number;
  /** Drafts that would be deleted as repeats. */
  redundant: number;
  /** Drafts that would be approved because the same seller dropped their price. */
  undercuts: number;
  /** Drafts left for a person, which is what the duplicates queue would keep. */
  decide: number;
}

export interface RepeatSweep extends RepeatPlan {
  deleted: number;
  approved: number;
  /** Undercuts this sweep did not get to. Run it again. */
  remaining: number;
  failures: string[];
}

/**
 * Work out what the sweep would do, touching nothing.
 *
 * Read before written, because the button that runs this deletes drafts in
 * the thousands and the person pressing it should be told the number first.
 */
export async function planRepeatSweep(): Promise<RepeatPlan> {
  return summarise(await decideAll());
}

/**
 * Settle every repeat there is.
 *
 * Deletions first. They are the bulk of it and they cannot fail in a way that
 * matters - a draft that is already gone is gone - whereas an approval that
 * dies half way through has written part of a listing. Doing the cheap,
 * reversible half first means an approval failure leaves a tidied queue
 * rather than an untouched one.
 */
export async function runRepeatSweep(by: string | undefined): Promise<RepeatSweep> {
  const verdicts = await decideAll();
  const plan = summarise(verdicts);

  if (!isSupabaseEnabled()) {
    return { ...plan, deleted: 0, approved: 0, remaining: plan.undercuts, failures: [] };
  }

  const supabase = getAdminScopedClient();
  const failures: string[] = [];

  const redundantIds = [...verdicts.values()]
    .flat()
    .filter((v) => v.verdict === 'redundant')
    .map((v) => v.draftId);

  let deleted = 0;
  for (let at = 0; at < redundantIds.length; at += DELETE_CHUNK) {
    const batch = redundantIds.slice(at, at + DELETE_CHUNK);
    /*
      Still pending, checked here rather than assumed.

      The plan was read a moment ago and somebody may have approved one of
      these in another tab since. Deleting an approved draft would not undo
      its listing, but it would destroy the record of where that listing's
      price came from, which is the thing the drafts table is for.
    */
    const { data, error } = await supabase
      .from('listing_drafts')
      .delete()
      .in('id', batch)
      .eq('status', 'pending')
      .select('id');

    if (error) failures.push(`a batch of repeats could not be deleted: ${error.message}`);
    deleted += (data ?? []).length;
  }

  const undercutIds = [...verdicts.values()]
    .flat()
    .filter((v) => v.verdict === 'undercuts')
    .map((v) => v.draftId);

  let approved = 0;
  for (const draftId of undercutIds.slice(0, APPROVE_PER_SWEEP)) {
    const outcome = await approveUndercut(draftId, by);
    if (outcome.kind === 'approved') approved += 1;
    else if (outcome.kind === 'failed') failures.push(outcome.error);
    // 'gone' is neither. Somebody dealt with it between the verdicts and this
    // call, and counting it as ours would be a count that lies - the same
    // mistake the bulk review queue had to be corrected for.
  }

  return {
    ...plan,
    deleted,
    approved,
    remaining: Math.max(0, undercutIds.length - APPROVE_PER_SWEEP),
    failures,
  };
}

/**
 * Approve one undercutting draft, and only it.
 *
 * Not `settleContested`, which deletes every other draft waiting on the
 * domain. That is right when a person has just chosen between the offers and
 * wrong here: an undercut settles one seller's repeat, and the rival seller's
 * offer on the same domain is exactly what we have not decided about. Sweeping
 * it away would quietly answer the question this queue exists to ask.
 */
type Undercut = { kind: 'approved' } | { kind: 'gone' } | { kind: 'failed'; error: string };

async function approveUndercut(draftId: string, by: string | undefined): Promise<Undercut> {
  const supabase = getAdminScopedClient();

  const { data } = await supabase
    .from('listing_drafts')
    .select('id, domain, email_id, matched_website_id, proposed, status')
    .eq('id', draftId)
    .maybeSingle();

  // Dealt with in another tab since the verdicts were worked out. Not a
  // failure and not an approval of ours.
  if (!data) return { kind: 'gone' };
  const draft = data as Record<string, unknown>;
  if (draft.status !== 'pending') return { kind: 'gone' };

  const parsed = extractedListingSchema.safeParse(draft.proposed);
  if (!parsed.success) {
    return {
      kind: 'failed',
      error: `${String(draft.domain)}: the cheaper draft does not parse, so it was left for review`,
    };
  }

  try {
    await approveDraft(draftId, parsed.data, {
      domain: String(draft.domain),
      matchedWebsiteId: (draft.matched_website_id as string | null) ?? null,
      emailId: String(draft.email_id),
      reviewer: by,
    });
  } catch (error) {
    return {
      kind: 'failed',
      error: `${String(draft.domain)}: ${error instanceof Error ? error.message : 'could not approve the cheaper draft'}`,
    };
  }

  return { kind: 'approved' };
}

/** Every contested domain's verdicts, keyed by domain. */
async function decideAll(): Promise<Map<string, RepeatVerdict[]>> {
  const groups = await sourcingService.duplicateGroups();
  if (groups.length === 0) return new Map();

  const rates = await fxService.rateMap();
  const decided = new Map<string, RepeatVerdict[]>();

  for (const group of groups) {
    // Re-ranked rather than trusted, so the verdicts and the prices on the
    // card are read off the same rates in the same request.
    decided.set(group.domain, resolveRepeats(rankOffers(group.offers, rates)));
  }

  return decided;
}

function summarise(verdicts: Map<string, RepeatVerdict[]>): RepeatPlan {
  const touched = new Set<string>();
  let redundant = 0;
  let undercuts = 0;
  let decide = 0;

  for (const [domain, list] of verdicts) {
    const r = list.filter((v) => v.verdict === 'redundant').length;
    const u = list.filter((v) => v.verdict === 'undercuts').length;
    redundant += r;
    undercuts += u;
    decide += list.filter((v) => v.verdict === 'decide').length;
    if (r > 0 || u > 0) touched.add(domain);
  }

  return { domains: touched.size, redundant, undercuts, decide };
}

/* ------------------------------------------------------------- blocked senders

  A reseller quoting 150 USD for a site four other people sell at 35 is not a
  draft with anything wrong on it. No flag catches them and no rule can: the
  number only looks wrong beside the rival offers, and by the time those have
  arrived somebody has read all four.

  So they are blocked by name, and the block is applied by a trigger on
  `inbound_emails` rather than here - see 0062. What is left for this file is
  reading what the person typed, and reporting what the block did.
*/

export interface BlockedSender {
  email: string | null;
  domain: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

/** Who we refuse to buy from, newest first. */
export async function blockedSenders(): Promise<BlockedSender[]> {
  if (!isSupabaseEnabled()) return [];

  const { data } = await getAdminScopedClient()
    .from('sourcing_blocklist')
    .select('email, domain, note, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    email: (row.email as string | null) ?? null,
    domain: (row.domain as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  }));
}

export type BlockOutcome =
  | { ok: true; what: string; draftsRemoved: number; emailsIgnored: number }
  | { ok: false; error: string };

/**
 * Block a sender, and clear what they have already sent.
 *
 * The counting and the deleting both happen inside `sourcing_block_sender`,
 * in one statement each against the same condition the trigger uses. Doing it
 * here instead would mean this function and the trigger each deciding who is
 * blocked, which is two answers to one question and exactly how the match
 * drifts - a sender refused on the way in but whose waiting drafts nobody
 * removed, or the reverse.
 */
export async function blockSender(
  typed: string,
  note: string | null,
  by: string | undefined,
): Promise<BlockOutcome> {
  const target = readBlockTarget(typed);
  if (target.kind === 'refused') return { ok: false, error: target.why };
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const { data, error } = await getAdminScopedClient().rpc('sourcing_block_sender', {
    p_email: target.kind === 'email' ? target.email : null,
    p_domain: target.kind === 'domain' ? target.domain : null,
    p_note: note,
    p_by: by ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { drafts_removed?: number; emails_ignored?: number }
    | null;

  return {
    ok: true,
    what: target.kind === 'email' ? target.email : `everyone at ${target.domain}`,
    draftsRemoved: row?.drafts_removed ?? 0,
    emailsIgnored: row?.emails_ignored ?? 0,
  };
}

/** Lift a block and put the replies it silenced back in the queue. */
export async function unblockSender(
  value: string,
): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

  const { data, error } = await getAdminScopedClient().rpc('sourcing_unblock_sender', {
    p_value: value,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, restored: typeof data === 'number' ? data : 0 };
}
