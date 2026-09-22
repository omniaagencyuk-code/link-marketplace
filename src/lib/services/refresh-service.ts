import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { AHREFS_MAX_BATCH, isAhrefsConfigured } from '@/lib/ahrefs/config';
import { AhrefsError, batchAnalysis, subscriptionInfo, type AhrefsUsage } from '@/lib/ahrefs/client';

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
 * What a call costs is read back from Ahrefs rather than assumed: the price
 * depends on the columns requested, so a configured `units_per_domain` is only
 * ever a forecast. Ahrefs' own usage figure is read before each run too, and
 * preferred to this job's arithmetic when the two disagree - the allowance is
 * shared with everything else on the account.
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
  /** Forecast only. The real cost is measured, not calculated. */
  unitsPerDomain: number;
  monthlyUnitBudget: number;
  budgetSafetyPct: number;
  billingCycleDay: number;
  batchSize: number;
  maxBatchesPerRun: number;
  projectionWarnPct: number;
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
  unitsEstimated?: number;
  ahrefsUnitsUsed?: number;
  ahrefsUnitsLimit?: number;
  ahrefsUsageResetAt?: string;
  overdueTier1?: number;
  overdueTier2?: number;
  overdueTier3?: number;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface AhrefsUsageSnapshot {
  unitsUsed: number;
  unitsLimit: number | null;
  usageResetAt: string | null;
  observedAt: string;
}

export interface RefreshStatus {
  settings: RefreshSettings | null;
  overdue: OverdueCount[];
  unitsThisCycle: number;
  cycleStart: string | null;
  recentRuns: RefreshRun[];
  ahrefsConfigured: boolean;
  /**
   * What the configured cadences would cost per month at today's inventory,
   * using the measured cost per domain where one exists.
   */
  projectedMonthlyUnits: number;
  /** Measured cost per domain, or null before any live run. */
  unitsPerDomainActual: number | null;
  /** The last live reading from Ahrefs, or null if there has never been one. */
  ahrefsUsage: AhrefsUsageSnapshot | null;
  /** Set when the settings row could not be read, with the reason. */
  settingsError: string | null;
}

const SETTINGS_SELECT =
  'enabled, dry_run, tier1_size, tier2_size, tier1_interval_days, tier2_interval_days, ' +
  'tier3_interval_days, units_per_domain, monthly_unit_budget, budget_safety_pct, ' +
  'billing_cycle_day, batch_size, max_batches_per_run, projection_warn_pct, updated_at, updated_by';

const RUN_SELECT =
  'id, status, reason, dry_run, domains_refreshed, domains_failed, batches, units_spent, ' +
  'units_estimated, ahrefs_units_used, ahrefs_units_limit, ahrefs_usage_reset_at, ' +
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
    projectionWarnPct: row.projection_warn_pct,
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
    unitsEstimated: row.units_estimated ?? undefined,
    ahrefsUnitsUsed: row.ahrefs_units_used ?? undefined,
    ahrefsUnitsLimit: row.ahrefs_units_limit ?? undefined,
    ahrefsUsageResetAt: row.ahrefs_usage_reset_at ?? undefined,
    overdueTier1: row.overdue_tier1 ?? undefined,
    overdueTier2: row.overdue_tier2 ?? undefined,
    overdueTier3: row.overdue_tier3 ?? undefined,
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Why the last settings read came back empty, for the admin page to show. */
let settingsError: string | null = null;

export const refreshService = {
  async getSettings(): Promise<RefreshSettings | null> {
    if (!isSupabaseEnabled()) return null;
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase
      .from('refresh_settings')
      .select(SETTINGS_SELECT)
      .maybeSingle();

    // A column this build reads that the database has not got yet fails the
    // whole select, and returning null for it would show the admin "settings
    // are not available" - which reads as "not set up" rather than "a
    // migration is missing". Said out loud instead, in the server log and on
    // the page. Nothing here carries a secret.
    if (error) {
      console.warn(`[refresh] could not read settings: ${error.message}`);
      settingsError = error.message;
      return null;
    }

    settingsError = null;
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
        | 'projectionWarnPct'
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
    put('projection_warn_pct', patch.projectionWarnPct);

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
      projectedMonthlyUnits: 0,
      unitsPerDomainActual: null,
      ahrefsUsage: null,
      settingsError: null,
    };
    if (!isSupabaseEnabled()) return base;

    const supabase = getAdminScopedClient();
    const [settings, overdue, units, cycleStart, runs, projected, perDomain, usage] =
      await Promise.all([
        refreshService.getSettings(),
        supabase.rpc('ahrefs_overdue_counts'),
        supabase.rpc('ahrefs_units_this_cycle'),
        supabase.rpc('ahrefs_cycle_start'),
        supabase
          .from('refresh_runs')
          .select(RUN_SELECT)
          .order('started_at', { ascending: false })
          .limit(10),
        // Both of these count live rows and measured costs, so the figure on
        // the page is about the inventory as it is now, not as it was assumed.
        supabase.rpc('ahrefs_projected_monthly_units'),
        supabase.rpc('ahrefs_units_per_domain_actual'),
        supabase.rpc('ahrefs_latest_usage'),
      ]);

    const usageRow = (Array.isArray(usage.data) ? usage.data[0] : usage.data) as
      | {
          units_used: number | null;
          units_limit: number | null;
          usage_reset_at: string | null;
          observed_at: string;
        }
      | null
      | undefined;

    return {
      ...base,
      settings,
      settingsError,
      overdue: ((overdue.data ?? []) as { tier: number; overdue: number; total: number }[]).map(
        (row) => ({ tier: row.tier, overdue: Number(row.overdue), total: Number(row.total) }),
      ),
      unitsThisCycle: typeof units.data === 'number' ? units.data : 0,
      cycleStart: typeof cycleStart.data === 'string' ? cycleStart.data : null,
      recentRuns: ((runs.data ?? []) as unknown[]).map(mapRun),
      projectedMonthlyUnits: Number(projected.data ?? 0) || 0,
      unitsPerDomainActual:
        perDomain.data == null ? null : Number(perDomain.data) || null,
      ahrefsUsage:
        usageRow && usageRow.units_used != null
          ? {
              unitsUsed: Number(usageRow.units_used),
              unitsLimit: usageRow.units_limit == null ? null : Number(usageRow.units_limit),
              usageResetAt: usageRow.usage_reset_at,
              observedAt: usageRow.observed_at,
            }
          : null,
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

    // ------------------------------------------------ what a domain costs
    //
    // Measured where there is evidence, configured where there is not. The
    // configured figure is a forecast: Ahrefs prices a call by the columns it
    // is asked for, so it goes stale the moment the request changes.
    const { data: measured } = await supabase.rpc('ahrefs_units_per_domain_actual');
    let unitCost =
      measured == null || !Number.isFinite(Number(measured)) || Number(measured) <= 0
        ? settings.unitsPerDomain
        : Number(measured);

    // --------------------------------------- what Ahrefs says has been spent
    //
    // Free to ask, and it covers every consumer of the allowance rather than
    // this job alone. Where it disagrees with the run history, Ahrefs wins:
    // the run history only knows about runs, and the account is shared.
    const live = await readUsage();
    if (live) {
      await supabase
        .from('refresh_runs')
        .update({
          ahrefs_units_used: live.unitsUsed,
          ahrefs_units_limit: live.unitsLimit,
          ahrefs_usage_reset_at: live.resetDate,
        })
        .eq('id', id);

      // Ahrefs also knows when the allowance resets, and the configured day
      // was a guess. Aligning it keeps this job's own cycle total covering the
      // same period as the account's - the settings row defaulted to the 1st
      // against a real reset on the 7th. Days past the 28th are left alone;
      // there is no such day in February.
      const resetDay = live.resetDate ? new Date(live.resetDate).getUTCDate() : null;
      if (resetDay && resetDay <= 28 && resetDay !== settings.billingCycleDay) {
        await refreshService.updateSettings({ billingCycleDay: resetDay }, 'ahrefs');
      }
    }

    const { data: spentSoFar } = await supabase.rpc('ahrefs_units_this_cycle');
    const ownSpend = typeof spentSoFar === 'number' ? spentSoFar : 0;
    const alreadySpent = live?.unitsUsed ?? ownSpend;
    const budget = live?.unitsLimit ?? settings.monthlyUnitBudget;
    const ceiling = Math.floor((budget * settings.budgetSafetyPct) / 100);

    if (alreadySpent >= ceiling) {
      const reason = `Budget guard: ${alreadySpent} of ${ceiling} units already spent this cycle`;
      await finishRun(id, { status: 'skipped', reason });
      return { status: 'skipped', reason, dryRun: settings.dryRun, runId: id, ...idle };
    }

    const batchSize = Math.min(settings.batchSize, AHREFS_MAX_BATCH);
    const costPerBatch = Math.ceil(batchSize * unitCost);

    // How many batches the remaining allowance affords, capped by the
    // per-run ceiling so one run cannot drain the month.
    const affordable = Math.floor((ceiling - alreadySpent) / Math.max(1, costPerBatch));
    const batchBudget = Math.min(affordable, settings.maxBatchesPerRun);

    if (batchBudget < 1) {
      const reason = `Budget guard: ${ceiling - alreadySpent} units left, a batch costs about ${costPerBatch}`;
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
      const estimate = Math.ceil(domains.length * unitCost);
      const reason =
        `Dry run: would refresh ${domains.length} domains in ` +
        `${Math.ceil(domains.length / batchSize)} batches ` +
        `for about ${estimate} units`;
      await finishRun(id, {
        status: 'completed',
        reason,
        batches: 0,
        units_spent: 0,
        units_estimated: estimate,
      });
      return { status: 'completed', reason, dryRun: true, runId: id, ...idle };
    }

    let refreshed = 0;
    let failed = 0;
    let batches = 0;
    let units = 0;
    let estimated = 0;
    const now = new Date().toISOString();

    for (let offset = 0; offset < domains.length; offset += batchSize) {
      const slice = domains.slice(offset, offset + batchSize);
      const expected = Math.ceil(slice.length * unitCost);

      // Re-checked before every batch: the allowance shrinks as the run
      // spends it, and one check at the start would be a check of the past.
      // `unitCost` is corrected from the previous batch's real cost, so a
      // forecast that was wrong is only wrong once.
      if (alreadySpent + units + expected > ceiling) break;

      const result = await batchAnalysis(slice.map((entry) => entry.domain));

      batches += 1;
      estimated += expected;
      // Ahrefs bills for every target sent, including ones it had no data
      // for. Its reported cost is used where it gave one; the estimate is the
      // fallback, so an unreported cost is never recorded as free.
      const spent = result.unitsCost ?? expected;
      units += spent;
      if (result.unitsCost != null && slice.length > 0 && result.unitsCost > 0) {
        unitCost = result.unitsCost / slice.length;
      }

      // Country codes for this batch, so an audience share is only ever
      // written against the market the listing actually claims.
      const { data: countryRows } = await supabase
        .from('websites')
        .select('id, country_code')
        .in(
          'id',
          slice.map((entry) => entry.id),
        );
      const countryById = new Map(
        ((countryRows ?? []) as { id: string; country_code: string }[]).map((row) => [
          row.id,
          row.country_code,
        ]),
      );

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
            ...audiencePatch(metrics, countryById.get(entry.id)),
          })
          .eq('id', entry.id);

        if (error) failed += 1;
        else refreshed += 1;
      }
    }

    const reason = `Refreshed ${refreshed} of ${domains.length} due`;
    await finishRun(id, {
      status: 'completed',
      domains_refreshed: refreshed,
      domains_failed: failed,
      batches,
      units_spent: units,
      units_estimated: estimated,
      reason,
    });

    return {
      status: 'completed',
      reason,
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

/**
 * Ahrefs' own view of the allowance, or null.
 *
 * A cross-check, not a dependency: if Ahrefs cannot be reached the run carries
 * on against the run history rather than refusing to work. Never throws, and
 * never logs the token.
 */
async function readUsage(): Promise<AhrefsUsage | null> {
  if (!isAhrefsConfigured()) return null;
  try {
    const usage = await subscriptionInfo();
    return usage.unitsUsed == null ? null : usage;
  } catch {
    return null;
  }
}

/**
 * Audience columns derived from the Ahrefs country breakdown.
 *
 * Shares are worked out from traffic rather than reported as percentages, so
 * they cannot contradict the traffic figure beside them. The denominator is
 * the larger of total organic traffic and the sum of the countries returned -
 * the top three cannot add up to more than the whole.
 *
 * `top_country_share` is the share of the market the listing claims. When the
 * breakdown came back and that market is not in it, the old figure is cleared
 * rather than left standing: a listing that said "78% of the audience is based
 * in the United Kingdom" with no measurable UK traffic is the exact claim this
 * is meant to stop.
 */
function audiencePatch(
  metrics: { organicTraffic: number; topCountries: { country: string; traffic: number }[] },
  countryCode: string | undefined,
): Record<string, unknown> {
  if (metrics.topCountries.length === 0) return {};

  const summed = metrics.topCountries.reduce((total, entry) => total + entry.traffic, 0);
  const denominator = Math.max(metrics.organicTraffic, summed);
  if (denominator <= 0) return {};

  const split = metrics.topCountries.map((entry) => ({
    country: entry.country,
    share: Math.round((entry.traffic / denominator) * 100),
    traffic: entry.traffic,
  }));

  const own = countryCode
    ? split.find((entry) => entry.country === countryCode.toUpperCase())
    : undefined;

  return { audience_split: split, top_country_share: own?.share ?? null };
}
