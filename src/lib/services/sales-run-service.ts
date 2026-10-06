import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import type { SalesRun, SalesRunKind } from '@/lib/types/sales';

/**
 * A sweep, as a row rather than a button press.
 *
 * Shared by every background job in the Sales Centre, because they all need
 * the same four things and writing them four times is writing three of them
 * slightly differently.
 *
 * The shape is the one `description_runs` and `gmail_import_jobs` already use,
 * and it exists for the same reason: a press lives as long as the request, and
 * a request lives three hundred seconds. Crawling four hundred websites does
 * not fit in that. So the press starts the run, the cron carries it, and a
 * closed tab strands nothing - whoever picks the run up claims it, works until
 * their time budget is spent, writes what they did and releases the lease.
 *
 * ## The lease, and why an hour
 *
 * A run holding a lease that has not been renewed for an hour is treated as
 * dead and reclaimed. Shorter would reclaim a run that is merely slow, and two
 * workers on the same prospects spend the budget twice; longer leaves a sweep
 * stuck after a function is killed mid-flight. The claim is in SQL, in
 * `sales_claim_run`, because deciding it in application code means two
 * processes can both decide yes.
 */

const RUN_SELECT = `
  id, kind, status, reason, dry_run, looked, succeeded, failed,
  input_tokens, output_tokens, cost_usd, credits_spent, leased_until,
  started_by, started_at, finished_at, error
`;

type Row = Record<string, unknown>;

function map(row: Row): SalesRun {
  return {
    id: String(row.id),
    kind: row.kind as SalesRunKind,
    status: row.status as SalesRun['status'],
    reason: (row.reason as string) ?? undefined,
    dryRun: Boolean(row.dry_run),
    looked: Number(row.looked ?? 0),
    succeeded: Number(row.succeeded ?? 0),
    failed: Number(row.failed ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    creditsSpent: Number(row.credits_spent ?? 0),
    leasedUntil: (row.leased_until as string) ?? undefined,
    startedBy: (row.started_by as string) ?? undefined,
    startedAt: String(row.started_at ?? ''),
    finishedAt: (row.finished_at as string) ?? undefined,
    error: (row.error as string) ?? undefined,
  };
}

/** How long a claim is held before a renewal. Renewed on every slice. */
const LEASE_MINUTES = 5;

export const salesRunService = {
  /**
   * Claim the sweep, or find out somebody else has it.
   *
   * Returns null when another run of the same kind is live. Null is not an
   * error: it is the answer to "may I start", and the caller's job is to say
   * so rather than to start anyway.
   */
  async claim(kind: SalesRunKind, dryRun: boolean, by?: string): Promise<string | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient().rpc('sales_claim_run', {
      p_kind: kind,
      p_dry_run: dryRun,
      p_by: by ?? null,
    });

    if (error) throw new Error(`Could not claim a ${kind} run: ${error.message}`);
    return (data as string | null) ?? null;
  },

  /** The live run of a kind, if there is one. */
  async live(kind: SalesRunKind): Promise<SalesRun | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('sales_runs')
      .select(RUN_SELECT)
      .eq('kind', kind)
      .eq('status', 'running')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Could not read the live ${kind} run: ${error.message}`);
    return data ? map(data as Row) : null;
  },

  async recent(limit = 10): Promise<SalesRun[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('sales_runs')
      .select(RUN_SELECT)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Could not read the run history: ${error.message}`);
    return (data ?? []).map((row) => map(row as Row));
  },

  /**
   * Add to the counters and push the lease out.
   *
   * Counters are added to rather than set, so two slices of one run do not
   * each overwrite the other's work with its own total. The lease is renewed
   * in the same statement: a slice that does work and forgets to renew hands
   * its own run to the next worker.
   */
  async progress(
    runId: string,
    delta: {
      looked?: number;
      succeeded?: number;
      failed?: number;
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      creditsSpent?: number;
    },
  ): Promise<void> {
    if (!isSupabaseEnabled()) return;

    const supabase = getAdminScopedClient();

    const { data: current } = await supabase
      .from('sales_runs')
      .select('looked, succeeded, failed, input_tokens, output_tokens, cost_usd, credits_spent')
      .eq('id', runId)
      .maybeSingle();

    const row = (current ?? {}) as Row;

    await supabase
      .from('sales_runs')
      .update({
        looked: Number(row.looked ?? 0) + (delta.looked ?? 0),
        succeeded: Number(row.succeeded ?? 0) + (delta.succeeded ?? 0),
        failed: Number(row.failed ?? 0) + (delta.failed ?? 0),
        input_tokens: Number(row.input_tokens ?? 0) + (delta.inputTokens ?? 0),
        output_tokens: Number(row.output_tokens ?? 0) + (delta.outputTokens ?? 0),
        cost_usd: Number(row.cost_usd ?? 0) + (delta.costUsd ?? 0),
        credits_spent: Number(row.credits_spent ?? 0) + (delta.creditsSpent ?? 0),
        leased_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
      })
      .eq('id', runId);
  },

  /**
   * Let go without finishing.
   *
   * What a slice does when its time budget is spent and there is more to do.
   * The lease is cleared rather than renewed, so the next cron tick picks the
   * run up immediately instead of waiting an hour for it to look abandoned.
   */
  async release(runId: string): Promise<void> {
    if (!isSupabaseEnabled()) return;

    await getAdminScopedClient()
      .from('sales_runs')
      .update({ leased_until: null })
      .eq('id', runId)
      .eq('status', 'running');
  },

  async finish(
    runId: string,
    outcome: { status: 'completed' | 'failed' | 'skipped'; reason?: string; error?: string },
  ): Promise<void> {
    if (!isSupabaseEnabled()) return;

    await getAdminScopedClient()
      .from('sales_runs')
      .update({
        status: outcome.status,
        reason: outcome.reason ?? null,
        error: outcome.error ? outcome.error.slice(0, 500) : null,
        leased_until: null,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
  },

  /**
   * Runs the cron should push along.
   *
   * A run still marked running whose lease is clear or expired is one whose
   * worker has gone - the tab was closed, or the function was killed. This is
   * what makes a sweep survive the person who started it.
   */
  async stalled(): Promise<SalesRun[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('sales_runs')
      .select(RUN_SELECT)
      .eq('status', 'running')
      .or(`leased_until.is.null,leased_until.lte.${new Date().toISOString()}`)
      .order('started_at');

    if (error) throw new Error(`Could not look for stalled runs: ${error.message}`);
    return (data ?? []).map((row) => map(row as Row));
  },
};
