'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { refreshService, runRefresh } from '@/lib/services/refresh-service';

/**
 * Controls for the Ahrefs refresh.
 *
 * The toggle writes to the database rather than to an environment variable, so
 * turning the job on or off takes effect on the next run without a redeploy.
 */

export interface RefreshActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function readNumber(formData: FormData, key: string): number | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}

export async function setRefreshEnabledAction(enabled: boolean): Promise<RefreshActionResult> {
  const session = await requireAdminSession();
  try {
    await refreshService.updateSettings({ enabled }, session.email);
    revalidatePath('/admin/refresh');
    return {
      ok: true,
      message: enabled
        ? 'Refresh is on. The next scheduled run will use Ahrefs credits.'
        : 'Refresh is off. Scheduled runs will do nothing until it is switched back on.',
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}

export async function setDryRunAction(dryRun: boolean): Promise<RefreshActionResult> {
  const session = await requireAdminSession();
  try {
    await refreshService.updateSettings({ dryRun }, session.email);
    revalidatePath('/admin/refresh');
    return {
      ok: true,
      message: dryRun
        ? 'Dry run on. Runs will select domains and log what they would do, without spending.'
        : 'Dry run off. Runs will call Ahrefs and spend credits.',
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}

export async function saveRefreshSettingsAction(formData: FormData): Promise<RefreshActionResult> {
  const session = await requireAdminSession();

  try {
    await refreshService.updateSettings(
      {
        tier1Size: readNumber(formData, 'tier1Size'),
        tier2Size: readNumber(formData, 'tier2Size'),
        tier1IntervalDays: readNumber(formData, 'tier1IntervalDays'),
        tier2IntervalDays: readNumber(formData, 'tier2IntervalDays'),
        tier3IntervalDays: readNumber(formData, 'tier3IntervalDays'),
        unitsPerDomain: readNumber(formData, 'unitsPerDomain'),
        monthlyUnitBudget: readNumber(formData, 'monthlyUnitBudget'),
        budgetSafetyPct: readNumber(formData, 'budgetSafetyPct'),
        billingCycleDay: readNumber(formData, 'billingCycleDay'),
        batchSize: readNumber(formData, 'batchSize'),
        maxBatchesPerRun: readNumber(formData, 'maxBatchesPerRun'),
      },
      session.email,
    );
    revalidatePath('/admin/refresh');
    return { ok: true, message: 'Settings saved.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save.' };
  }
}

/** Recalculate every unlocked domain's tier from its current rank. */
export async function assignTiersAction(): Promise<RefreshActionResult> {
  await requireAdminSession();
  try {
    const counts = await refreshService.assignTiers();
    revalidatePath('/admin/refresh');
    return {
      ok: true,
      message: counts
        ? `Tiers assigned: ${counts.tier1} weekly, ${counts.tier2} biweekly, ${counts.tier3} monthly.`
        : 'Tiers assigned.',
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not assign tiers.' };
  }
}

/**
 * Run the job now, without waiting for the schedule.
 *
 * Obeys the same switches as the scheduled run: off means off, dry run means
 * dry run. It is a way to watch the logic work, not a way around the guards.
 */
export async function runNowAction(): Promise<RefreshActionResult> {
  await requireAdminSession();
  try {
    const outcome = await runRefresh();
    revalidatePath('/admin/refresh');
    return {
      ok: outcome.status !== 'failed',
      message:
        `${outcome.status}${outcome.dryRun ? ' (dry run)' : ''}: ` +
        `${outcome.reason ?? ''} - refreshed ${outcome.domainsRefreshed}, ` +
        `${outcome.unitsSpent} units`,
      error: outcome.status === 'failed' ? outcome.reason : undefined,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'The run failed.' };
  }
}
