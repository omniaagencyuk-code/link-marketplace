'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export interface GapAdminResult {
  ok: boolean;
  message?: string;
  error?: string;
}

/**
 * The gap finder's own settings.
 *
 * Every field here is a cost control, so each is validated on the way in
 * rather than trusted: the form is an endpoint, and a row cap of 2,000,000
 * typed by accident is a month's allowance in one report.
 */
export async function saveGapSettingsAction(formData: FormData): Promise<GapAdminResult> {
  const session = await requireAdminSession();
  if (!isSupabaseEnabled()) return { ok: false, error: 'No database.' };

  const number = (name: string, min: number, max: number): number | undefined => {
    const raw = formData.get(name);
    if (raw === null || raw === '') return undefined;
    const value = Math.floor(Number(raw));
    if (!Number.isFinite(value)) return undefined;
    return Math.max(min, Math.min(max, value));
  };

  const row: Record<string, unknown> = { updated_by: session.email };
  const put = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };

  put('monthly_unit_budget', number('monthlyUnitBudget', 0, 2_000_000));
  put('unit_safety_pct', number('unitSafetyPct', 1, 100));
  put('billing_cycle_day', number('billingCycleDay', 1, 28));
  put('rows_per_target', number('rowsPerTarget', 100, 25_000));
  put('max_competitors', number('maxCompetitors', 1, 5));
  put('cache_days', number('cacheDays', 1, 180));
  put('runs_per_account', number('runsPerAccount', 0, 1000));

  const { error } = await getAdminScopedClient()
    .from('gap_settings')
    .update(row)
    .eq('id', true);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/link-gap');
  return { ok: true, message: 'Saved.' };
}

export async function setGapEnabledAction(enabled: boolean): Promise<GapAdminResult> {
  const session = await requireAdminSession();
  if (!isSupabaseEnabled()) return { ok: false, error: 'No database.' };

  const { error } = await getAdminScopedClient()
    .from('gap_settings')
    .update({ enabled, updated_by: session.email })
    .eq('id', true);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/link-gap');
  return {
    ok: true,
    message: enabled
      ? 'The gap finder is on. Customer reports will spend Ahrefs units against its own budget.'
      : 'The gap finder is off. Nothing will be spent.',
  };
}
