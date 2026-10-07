import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { extractedListingSchema } from '@/lib/sourcing/schema';
import { approveDraft } from './draft-approval';

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

export interface ApprovalRun {
  id: string;
  status: 'running' | 'finished' | 'cancelled' | 'failed';
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
  'id, status, total, approved, failed, first_error, failed_ids, ticks, started_by, started_at, finished_at';

type Row = Record<string, unknown>;

function mapRun(row: Row): ApprovalRun {
  return {
    id: String(row.id),
    status: row.status as ApprovalRun['status'],
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

/** How many drafts an approve-all would touch right now. */
export async function eligibleCount(): Promise<number> {
  if (!isSupabaseEnabled()) return 0;
  const { data } = await getAdminScopedClient().rpc('draft_approval_eligible_count');
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
): Promise<{ ok: true; runId: string; total: number } | { ok: false; error: string }> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'Not available right now.' };

  const supabase = getAdminScopedClient();

  const { data: running } = await supabase
    .from('draft_approval_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
    .maybeSingle();

  if (running) return { ok: false, error: 'An approval run is already going.' };

  const total = await eligibleCount();
  if (total === 0) {
    return { ok: false, error: 'There is nothing waiting that can be approved without a look.' };
  }

  const { data, error } = await supabase
    .from('draft_approval_runs')
    .insert({ total, started_by: by })
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

  let emptied = false;

  try {
    while (Date.now() < deadline) {
      const { data: batch, error } = await supabase.rpc('draft_approval_batch', {
        p_limit: CHUNK,
        p_exclude: [...failedIds],
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

        try {
          await approveDraft(String(draft.id), parsed.data, {
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
