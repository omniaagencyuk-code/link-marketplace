import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { AHREFS_MAX_BATCH, isAhrefsConfigured } from '@/lib/ahrefs/config';
import { AhrefsError, batchAnalysis } from '@/lib/ahrefs/client';

/**
 * The tiered Ahrefs refresh.
 *
 * Domain rating and organic traffic go stale, and refreshing every domain on
 * one cadence either costs too much or leaves the best listings out of date.
 * Domains sit in three tiers refreshed at different intervals, and the job
 * spends against a tracked budget rather than hoping.
 *
 * Three things are deliberate about the order of checks in `runRefresh`:
 *
 * 1. The enabled flag is read before anything else, so an off switch means
 *    zero Ahrefs calls and zero units - not "a cheap run".
 * 2. The run is claimed in the database before any work, so a slow run and the
 *    next day's run cannot work the same domains.
 * 3. The budget is checked before every batch, not once at the start, because
 *    the remaining allowance changes as the run spends it.
 *
 * Everything runs as the service role. The cron caller is a machine with no
 * Supabase session, and the tables are admin-only.
 */

export interface RefreshSettings {
  enabled: boolean;
  dryRun: boolean;
  tier1Size: number;
  tier2Size: number;
  tier1IntervalDays: number;
  tier2IntervalDays: number;
  tier3IntervalDays: number;
  unitsPerDomain: number;
  monthlyUnitBudget: number;
  budgetSafetyPct: number;
  billingCycleDay: number;
  batchSize: number;
  maxBatchesPerRun: number;
  updatedAt: string;
  updatedBy?: string;
}

export interface OverdueCount {
  tier: number;
  overdue: number;
  total: number;
}

export interface RefreshRun {
  id: string;
  status: 'running' | 'completed' | 'skipped' | 'failed';
  reason?: string;
  dryRun: boolean;
  domainsRefreshed: number;
  domainsFailed: number;
  batches: number;
  unitsSpent: number;
  overdueTier1?: number;
  overdueTier2?: number;
  overdueTier3?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface RefreshStatus {
  settings: RefreshSettings | null;
  overdue: OverdueCount[];
  unitsThisCycle: number;
  cycleStart: string | null;
  recentRuns: RefreshRun[];
  ahrefsConfigured: boolean;
}

const SETTINGS_SELECT =
  'enabled, dry_run, tier1_size, tier2_size, tier1_interval_days, tier2_interval_days, ' +
  'tier3_interval_days, units_per_domain, monthly_unit_budget, budget_safety_pct, ' +
  'billing_cycle_day, batch_size, max_batches_per_run, updated_at, updated_by';

const RUN_SELECT =
  'id, status, reason, dry_run, domains_refreshed, domains_failed, batches, units_spent, ' +
  'overdue_tier1, overdue_tier2, overdue_tier3, error, started_at, finished_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapSettings(row: any): RefreshSettings {
  return {
    enabled: row.enabled,
    dryRun: row.dry_run,
    tier1Size: row.tier1_size,
    tier2Size: row.tier2_size,
    tier1IntervalDays: row.tier1_interval_days,
    tier2IntervalDays: row.tier2_interval_days,
    tier3IntervalDays: row.tier3_interval_days,
    unitsPerDomain: row.units_per_domain,
    monthlyUnitBudget: row.monthly_unit_budget,
    budgetSafetyPct: row.budget_safety_pct,
    billingCycleDay: row.billing_cycle_day,
    batchSize: row.batch_size,
    maxBatchesPerRun: row.max_batches_per_run,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

function mapRun(row: any): RefreshRun {
  return {
    id: row.id,
    status: row.status,
    reason: row.reason ?? undefined,
    dryRun: row.dry_run,
    domainsRefreshed: row.domains_refreshed,
    domainsFailed: row.domains_failed,
    batches: row.batches,
    unitsSpent: row.units_spent,
    overdueTier1: row.overdue_tier1 ?? undefined,
    overdueTier2: row.overdue_tier2 ?? undefined,
    overdueTier3: row.overdue_tier3 ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const refreshService = {
  async getSettings(): Promise<RefreshSettings | null> {
    if (!isSupabaseEnabled()) return null;
    const supabase = getAdminScopedClient();
    const { data } = await supabase.from('refresh_settings').select(SETTINGS_SELECT).maybeSingle();
    return data ? mapSettings(data) : null;
  },

  /** Partial update. Only the keys supplied are written. */
  async updateSettings(
    patch: Partial<
      Pick<
        RefreshSettings,
        | 'enabled'
        | 'dryRun'
        | 'tier1Size'
        | 'tier2Size'
        | 'tier1IntervalDays'
        | 'tier2IntervalDays'
        | 'tier3IntervalDays'
        | 'unitsPerDomain'
        | 'monthlyUnitBudget'
        | 'budgetSafetyPct'
        | 'billingCycleDay'
        | 'batchSize'
        | 'maxBatchesPerRun'
      >
    >,
    updatedBy?: string,
  ): Promise<RefreshSettings | null> {
    if (!isSupabaseEnabled()) return null;

    const row: Record<string, unknown> = { updated_by: updatedBy ?? null };
    const put = (key: string, value: unknown) => {
      if (value !== undefined) row[key] = value;
    };

    put('enabled', patch.enabled);
    put('dry_run', patch.dryRun);
    put('tier1_size', patch.tier1Size);
    put('tier2_size', patch.tier2Size);
    put('tier1_interval_days', patch.tier1IntervalDays);
    put('tier2_interval_days', patch.tier2IntervalDays);
    put('tier3_interval_days', patch.tier3IntervalDays);
    put('units_per_domain', patch.unitsPerDomain);
    put('monthly_unit_budget', patch.monthlyUnitBudget);
    put('budget_safety_pct', patch.budgetSafetyPct);
    put('billing_cycle_day', patch.billingCycleDay);
    put('batch_size', patch.batchSize);
    put('max_batches_per_run', patch.maxBatchesPerRun);

    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('refresh_settings')
      .update(row)
      .eq('id', true)
      .select(SETTINGS_SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not update refresh settings: ${error.message}`);
    return data ? mapSettings(data) : null;
  },

  /** Recalculate every unlocked domain's tier from its current rank. */
  async assignTiers(): Promise<{ tier1: number; tier2: number; tier3: number } | null> {
    if (!isSupabaseEnabled()) return null;
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('assign_ahrefs_tiers');
    if (error) throw new Error(`Could not assign tiers: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    return row ? { tier1: row.tier1, tier2: row.tier2, tier3: row.tier3 } : null;
  },

  /** Everything the admin page and the status endpoint need, in one read. */
  async getStatus(): Promise<RefreshStatus> {
    const base: RefreshStatus = {
      settings: null,
      overdue: [],
      unitsThisCycle: 0,
      cycleStart: null,
      recentRuns: [],
      ahrefsConfigured: isAhrefsConfigured(),
    };
    if (!isSupabaseEnabled()) return base;

    const supabase = getAdminScopedClient();
    const [settings, overdue, units, cycleStart, runs] = await Promise.all([
      refreshService.getSettings(),
      supabase.rpc('ahrefs_overdue_counts'),
      supabase.rpc('ahrefs_units_this_cycle'),
      supabase.rpc('ahrefs_cycle_start'),
      supabase.from('refresh_runs').select(RUN_SELECT).order('started_at', { ascending: false }).limit(10),
    ]);

    return {
      ...base,
      settings,
      overdue: ((overdue.data ?? []) as { tier: number; overdue: number; total: number }[]).map(
        (row) => ({ tier: row.tier, overdue: Number(row.overdue), total: Number(row.total) }),
      ),
      unitsThisCycle: typeof units.data === 'number' ? units.data : 0,
      cycleStart: typeof cycleStart.data === 'string' ? cycleStart.data : null,
      recentRuns: ((runs.data ?? []) as unknown[]).map(mapRun),
    };
  },
};

export interface RunOutcome {
  status: 'completed' | 'skipped' | 'failed';
  reason?: string;
  domainsRefreshed: number;
  domainsFailed: number;
  batches: number;
  unitsSpent: number;
  dryRun: boolean;
  runId?: string;
}

/** Close a run row out with its totals and the outstanding counts. */
async function finishRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const supabase = getAdminScopedClient();
  const { data: overdue } = await supabase.rpc('ahrefs_overdue_counts');
  const byTier = new Map(
    ((overdue ?? []) as { tier: number; overdue: number }[]).map((row) => [
      row.tier,
      Number(row.overdue),
    ]),
  );

  await supabase
    .from('refresh_runs')
    .update({
      ...patch,
      overdue_tier1: byTier.get(1) ?? 0,
      overdue_tier2: byTier.get(2) ?? 0,
      overdue_tier3: byTier.get(3) ?? 0,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);
}

/**
 * One scheduled run.
 *
 * Safe to call daily whatever the settings say. When the job is off it does
 * nothing and records that it did nothing, which is what makes the schedule
 * itself testable before any money is at stake.
 */
export async function runRefresh(): Promise<RunOutcome> {
  const idle = { domainsRefreshed: 0, domainsFailed: 0, batches: 0, unitsSpent: 0 };

  if (!isSupabaseEnabled()) {
    return { status: 'skipped', reason: 'Database not connected', dryRun: false, ...idle };
  }

  const settings = await refreshService.getSettings();
  if (!settings) {
    return { status: 'skipped', reason: 'No refresh settings row', dryRun: false, ...idle };
  }

  // The master switch, checked before anything else. Nothing below this line
  // costs a unit, and nothing above it talks to Ahrefs.
  if (!settings.enabled) {
    return { status: 'skipped', reason: 'Refresh disabled, skipping', dryRun: settings.dryRun, ...idle };
  }

  const supabase = getAdminScopedClient();

  // Claim the run. A null id means another run holds it.
  const { data: runId, error: claimError } = await supabase.rpc('start_refresh_run', {
    p_dry_run: settings.dryRun,
  });
  if (claimError) {
    return { status: 'failed', reason: claimError.message, dryRun: settings.dryRun, ...idle };
  }
  if (!runId) {
    return {
      status: 'skipped',
      reason: 'A previous run is still in progress',
      dryRun: settings.dryRun,
      ...idle,
    };
  }

  const id = runId as string;

  try {
    if (!settings.dryRun && !isAhrefsConfigured()) {
      await finishRun(id, { status: 'skipped', reason: 'AHREFS_API_TOKEN is not set' });
      return {
        status: 'skipped',
        reason: 'AHREFS_API_TOKEN is not set',
        dryRun: false,
        runId: id,
        ...idle,
      };
    }

    const { data: spentSoFar } = await supabase.rpc('ahrefs_units_this_cycle');
    const alreadySpent = typeof spentSoFar === 'number' ? spentSoFar : 0;
    const ceiling = Math.floor(
      (settings.monthlyUnitBudget * settings.budgetSafetyPct) / 100,
    );

    if (alreadySpent >= ceiling) {
      const reason = `Budget guard: ${alreadySpent} of ${ceiling} units already spent this cycle`;
      await finishRun(id, { status: 'skipped', reason });
      return { status: 'skipped', reason, dryRun: settings.dryRun, runId: id, ...idle };
    }

    const batchSize = Math.min(settings.batchSize, AHREFS_MAX_BATCH);
    const costPerBatch = batchSize * settings.unitsPerDomain;

    // How many batches the remaining allowance affords, capped by the
    // per-run ceiling so one run cannot drain the month.
    const affordable = Math.floor((ceiling - alreadySpent) / costPerBatch);
    const batchBudget = Math.min(affordable, settings.maxBatchesPerRun);

    if (batchBudget < 1) {
      const reason = `Budget guard: ${ceiling - alreadySpent} units left, a batch costs ${costPerBatch}`;
      await finishRun(id, { status: 'skipped', reason });
      return { status: 'skipped', reason, dryRun: settings.dryRun, runId: id, ...idle };
    }

    const { data: due, error: dueError } = await supabase.rpc('ahrefs_due_domains', {
      p_limit: batchBudget * batchSize,
    });
    if (dueError) throw new Error(dueError.message);

    const domains = (due ?? []) as { id: string; domain: string; tier: number }[];

    if (domains.length === 0) {
      await finishRun(id, { status: 'completed', reason: 'Nothing due' });
      return { status: 'completed', reason: 'Nothing due', dryRun: settings.dryRun, runId: id, ...idle };
    }

    // Dry run stops here: the selection has been proved without spending.
    if (settings.dryRun) {
      const reason =
        `Dry run: would refresh ${domains.length} domains in ` +
        `${Math.ceil(domains.length / batchSize)} batches ` +
        `for ${domains.length * settings.unitsPerDomain} units`;
      await finishRun(id, { status: 'completed', reason, batches: 0, units_spent: 0 });
      return { status: 'completed', reason, dryRun: true, runId: id, ...idle };
    }

    let refreshed = 0;
    let failed = 0;
    let batches = 0;
    let units = 0;
    const now = new Date().toISOString();

    for (let offset = 0; offset < domains.length; offset += batchSize) {
      // Re-checked before every batch: the allowance shrinks as the run
      // spends it, and one check at the start would be a check of the past.
      if (alreadySpent + units + costPerBatch > ceiling) break;

      const slice = domains.slice(offset, offset + batchSize);
      const result = await batchAnalysis(slice.map((entry) => entry.domain));

      // Ahrefs bills for every target sent, including ones it had no data
      // for, so the cost is counted on the batch rather than on the hits.
      batches += 1;
      units += slice.length * settings.unitsPerDomain;

      for (const entry of slice) {
        const metrics = result.metrics.get(entry.domain);
        if (!metrics) {
          // Left untouched, so it stays due and is tried again next run
          // rather than being marked fresh with no new data.
          failed += 1;
          continue;
        }

        const { error } = await supabase
          .from('websites')
          .update({
            domain_rating: metrics.domainRating,
            organic_traffic: metrics.organicTraffic,
            last_ahrefs_refresh_at: now,
          })
          .eq('id', entry.id);

        if (error) failed += 1;
        else refreshed += 1;
      }
    }

    await finishRun(id, {
      status: 'completed',
      domains_refreshed: refreshed,
      domains_failed: failed,
      batches,
      units_spent: units,
      reason: `Refreshed ${refreshed} of ${domains.length} due`,
    });

    return {
      status: 'completed',
      reason: `Refreshed ${refreshed} of ${domains.length} due`,
      domainsRefreshed: refreshed,
      domainsFailed: failed,
      batches,
      unitsSpent: units,
      dryRun: false,
      runId: id,
    };
  } catch (error) {
    const message =
      error instanceof AhrefsError || error instanceof Error
        ? error.message
        : 'Refresh failed';
    // The run is closed out rather than left claimed, so tomorrow's run is not
    // blocked by today's failure.
    await finishRun(id, { status: 'failed', error: message });
    return { status: 'failed', reason: message, dryRun: settings.dryRun, runId: id, ...idle };
  }
}
