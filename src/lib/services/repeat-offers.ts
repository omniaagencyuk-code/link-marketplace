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
