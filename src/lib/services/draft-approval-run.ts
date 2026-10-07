import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { extractedListingSchema } from '@/lib/sourcing/schema';
import { applyGeneralPriceToNiches, approveDraft } from './draft-approval';

/**
 * Approving the whole queue, a slice at a time.
 *
 * `bulkApproveConfidentAction` decides what may be swept up and does it well;
 * what it cannot do is finish. The browser hands it a hundred drafts per
 * request because a serverless function dies at three hundred seconds, so
 * eight thousand drafts is somebody holding a tab open and pressing a button
 * forty times.
 *
 * This is the same rules with a different driver: one press starts a run, and
 * cron carries it on every few minutes until the queue is empty, whether or
 * not anybody is still logged in. The shape is copied from the description
 * sweep for the same reason it exists there.
 *
 * ## What it does not change
 *
 * The rules. A draft is eligible when it has no low-confidence field, no
 * reviewer flag, and no second offer for the same domain - and all three now
 * live in `draft_approval_batch` rather than being reassembled by each caller.
 * A draft carrying "single price, confirm niches" is precisely the one a human
 * has to look at, and this must never be the thing that approves it.
 *
 * The path. `approveDraft` still runs once per draft, with the name of the
 * person who started the run. Nothing here writes a listing.
 */

/** How many to approve before checking the clock again. */
const CHUNK = 25;

/** A claim older than this is treated as abandoned by a killed function. */
const STALE_CLAIM_SECONDS = 600;

const DEFAULT_BUDGET_MS = 240_000;

export type ApprovalMode = 'confident' | 'priced';

export interface ApprovalRun {
  id: string;
  status: 'running' | 'finished' | 'cancelled' | 'failed';
  /**
   * Which rules this run used.
   *
   * `confident` is nothing flagged and nothing low-confidence. `priced` is
   * anything carrying a general price, which lets through the three flags that
   * mean "somebody should look" and still refuses the two that mean the row
   * would be wrong - a price with no currency, and a reply about a different
   * domain than the draft.
   */
  mode: ApprovalMode;
  /** Whether the general price was applied to unmentioned sensitive niches. */
  spreadNiches: boolean;
  total: number;
  approved: number;
  failed: number;
  firstError?: string;
  ticks: number;
  startedBy: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ApprovalSlice {
  /** Nothing was running, or somebody else is already on it. */
  idle: boolean;
  approved: number;
  failed: number;
  finished: boolean;
  outOfTime: boolean;
}

const RUN_COLUMNS =
  'id, status, mode, spread_niches, total, approved, failed, first_error, failed_ids, ticks, started_by, started_at, finished_at';

type Row = Record<string, unknown>;

function mapRun(row: Row): ApprovalRun {
  return {
    id: String(row.id),
    status: row.status as ApprovalRun['status'],
    mode: (row.mode as ApprovalMode) ?? 'confident',
    spreadNiches: Boolean(row.spread_niches),
    total: Number(row.total ?? 0),
    approved: Number(row.approved ?? 0),
    failed: Number(row.failed ?? 0),
    firstError: (row.first_error as string) ?? undefined,
    ticks: Number(row.ticks ?? 0),
    startedBy: String(row.started_by ?? ''),
    startedAt: String(row.started_at ?? ''),
    finishedAt: (row.finished_at as string) ?? undefined,
  };
}

/** How many drafts an approve-all would touch right now, under one mode. */
export async function eligibleCount(mode: ApprovalMode = 'confident'): Promise<number> {
  if (!isSupabaseEnabled()) return 0;
  const { data } = await getAdminScopedClient().rpc('draft_approval_eligible_count', {
    p_relaxed: mode === 'priced',
  });
  return Number(data ?? 0);
}

/** The run in progress, or the last one to finish. */
export async function latestApprovalRun(): Promise<ApprovalRun | null> {
  if (!isSupabaseEnabled()) return null;

  const { data } = await getAdminScopedClient()
    .from('draft_approval_runs')
    .select(RUN_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? mapRun(data as Row) : null;
}

/**
 * Start one.
 *
 * Refuses while another is running rather than queueing a second: two runs
 * would claim alternate slices of the same queue and race each other through
 * `approveDraft`, and nobody pressing this button twice means to do that.
 */
export async function startApprovalRun(
  by: string,
  options: { mode?: ApprovalMode; spreadNiches?: boolean } = {},
): Promise<{ ok: true; runId: string; total: number } | { ok: false; error: string }> {
  const mode: ApprovalMode = options.mode === 'priced' ? 'priced' : 'confident';

  /*
    Spreading only means something under the priced rule.

    Under `confident` every eligible draft already states its niches - that is
    what unflagged means - so there is nothing unmentioned to apply a price to,
    and recording `spread_niches` would claim a decision nobody made.
  */
  const spreadNiches = mode === 'priced' && options.spreadNiches === true;
  if (!isSupabaseEnabled()) return { ok: false, error: 'Not available right now.' };

  const supabase = getAdminScopedClient();

  const { data: running } = await supabase
    .from('draft_approval_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
    .maybeSingle();

  if (running) return { ok: false, error: 'An approval run is already going.' };

  const total = await eligibleCount(mode);
  if (total === 0) {
    return { ok: false, error: 'There is nothing waiting that this would approve.' };
  }

  const { data, error } = await supabase
    .from('draft_approval_runs')
    .insert({ total, started_by: by, mode, spread_niches: spreadNiches })
    .select('id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: 'Could not start that run.' };
  return { ok: true, runId: String((data as Row).id), total };
}

export async function cancelApprovalRun(): Promise<boolean> {
  if (!isSupabaseEnabled()) return false;

  const { error } = await getAdminScopedClient()
    .from('draft_approval_runs')
    .update({
      status: 'cancelled',
      finished_at: new Date().toISOString(),
      status_reason: 'Stopped by an admin',
    })
    .eq('status', 'running');

  return !error;
}

/**
 * One slice.
 *
 * Claims the run, approves until the budget runs out or the queue empties,
 * writes the counters back. Returns without doing anything when no run is
 * going, which is most ticks.
 *
 * The counters are written after every chunk rather than only at the end: a
 * function killed mid-slice loses at most a chunk of progress, and the next
 * tick picks up from the row rather than starting again.
 */
export async function advanceApprovalRun(budgetMs = DEFAULT_BUDGET_MS): Promise<ApprovalSlice> {
  const slice: ApprovalSlice = {
    idle: true,
    approved: 0,
    failed: 0,
    finished: false,
    outOfTime: false,
  };

  if (!isSupabaseEnabled()) return slice;

  const supabase = getAdminScopedClient();
  const deadline = Date.now() + budgetMs;

  const { data: claimed } = await supabase.rpc('claim_draft_approval_run', {
    p_stale_seconds: STALE_CLAIM_SECONDS,
  });

  const runId = typeof claimed === 'string' ? claimed : null;
  if (!runId) return slice;

  slice.idle = false;

  const { data: runRow } = await supabase
    .from('draft_approval_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .maybeSingle();

  if (!runRow) return slice;
  const row = runRow as Row;

  let approved = Number(row.approved ?? 0);
  let failed = Number(row.failed ?? 0);
  let firstError = (row.first_error as string | null) ?? null;
  const failedIds = new Set<string>(((row.failed_ids as string[] | null) ?? []).map(String));
  const by = String(row.started_by ?? 'an admin');
  const relaxed = (row.mode as string) === 'priced';
  const spreadNiches = Boolean(row.spread_niches);

  let emptied = false;

  try {
    while (Date.now() < deadline) {
      const { data: batch, error } = await supabase.rpc('draft_approval_batch', {
        p_limit: CHUNK,
        p_exclude: [...failedIds],
        p_relaxed: relaxed,
      });

      if (error) throw new Error(error.message);

      const drafts = (batch ?? []) as Row[];
      if (drafts.length === 0) {
        emptied = true;
        break;
      }

      for (const draft of drafts) {
        if (Date.now() >= deadline) break;

        const parsed = extractedListingSchema.safeParse(draft.proposed);
        if (!parsed.success) {
          /*
            A draft whose stored extraction no longer matches the schema is a
            failure, not a skip. Counting it as skipped would leave it in the
            queue with nothing saying why, and the run would hand itself the
            same one for ever - `listing_drafts` has no failed status to move
            it to, so the run remembers it instead.
          */
          failedIds.add(String(draft.id));
          failed += 1;
          firstError ??= `${String(draft.domain)}: the stored extraction no longer reads`;
          continue;
        }

        /*
          The spread is applied to the listing being approved, not stored back
          on the draft.

          `applyGeneralPriceToNiches` marks every sensitive niche accepted at
          the general price and skips any the publisher explicitly refused - a
          publisher who said "no gambling" has not been talked round by a
          button. Doing it here rather than earlier means the draft keeps the
          reading the model actually produced, so what the publisher said and
          what we decided to infer stay separable afterwards.

          Only where there is a general price to spread. It fills each niche
          from `guest_post_cost ?? null` and `link_insertion_cost ?? null`, so
          on a draft whose only price is the one for the publisher writing it
          themselves, every sensitive niche would come out accepted at no price
          at all - which is a worse claim than leaving them unknown, because
          "yes at nothing" reads as an offer.
        */
        const canSpread =
          parsed.data.guest_post_cost != null || parsed.data.link_insertion_cost != null;
        const listing = spreadNiches && canSpread ? applyGeneralPriceToNiches(parsed.data) : parsed.data;

        try {
          await approveDraft(String(draft.id), listing, {
            domain: String(draft.domain),
            matchedWebsiteId: (draft.matched_website_id as string | null) ?? null,
            emailId: String(draft.email_id),
            reviewer: by,
          });
          approved += 1;
          slice.approved += 1;
        } catch (cause) {
          failedIds.add(String(draft.id));
          failed += 1;
          slice.failed += 1;
          firstError ??= `${String(draft.domain)}: ${
            cause instanceof Error ? cause.message.slice(0, 200) : 'approval failed'
          }`;
        }
      }

      await supabase
        .from('draft_approval_runs')
        .update({
          approved,
          failed,
          first_error: firstError,
          failed_ids: [...failedIds],
          claimed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
  } catch (cause) {
    await supabase
      .from('draft_approval_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        status_reason: cause instanceof Error ? cause.message.slice(0, 300) : 'The run failed',
        approved,
        failed,
        first_error: firstError,
        failed_ids: [...failedIds],
      })
      .eq('id', runId);

    console.error('[approve-all] run failed:', String(cause).slice(0, 200));
    return slice;
  }

  if (emptied) {
    slice.finished = true;
    await supabase
      .from('draft_approval_runs')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString(),
        approved,
        failed,
        first_error: firstError,
        failed_ids: [...failedIds],
        claimed_at: null,
      })
      .eq('id', runId);
  } else {
    slice.outOfTime = true;
    /*
      The claim is released rather than left to go stale.

      A run that ran out of time is ready for the next tick immediately; making
      it wait out the ten-minute stale window would turn a twenty-minute job
      into an hour of mostly waiting.
    */
    await supabase
      .from('draft_approval_runs')
      .update({ approved, failed, first_error: firstError, failed_ids: [...failedIds], claimed_at: null })
      .eq('id', runId);
  }

  return slice;
}
