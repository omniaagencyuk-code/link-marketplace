import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import type { SalesSettings } from '@/lib/types/sales';

/**
 * The switches behind the Sales Centre.
 *
 * One row, pinned, in the same arrangement as `refresh_settings`: what governs
 * a job lives beside the job rather than in an environment variable, so a cap
 * can be changed without a redeploy and the change is visible to whoever
 * changes it.
 *
 * Two of these defaults are deliberate refusals rather than conservative
 * guesses:
 *
 *   `enabled` is false and `dryRun` is true, in that order of importance.
 *   Turning the feature on while dry run is still set costs nothing, which is
 *   the order to enable them in.
 *
 *   `hunterMonthlyCreditBudget` is zero, so every lookup is refused. A credit
 *   budget nobody has set is a budget nobody has agreed to spend, and
 *   refusing is the only reading that cannot cost money by accident.
 */

const SELECT = `
  enabled, dry_run, model, monthly_ai_budget_usd,
  hunter_monthly_credit_budget, hunter_credit_safety_pct, hunter_cycle_day,
  daily_send_cap, per_domain_open_cap, max_follow_ups, follow_up_gap_days,
  send_from, send_reply_to, crawl_max_pages, min_score_to_contact,
  updated_at, updated_by
`;

type Row = Record<string, unknown>;

function map(row: Row): SalesSettings {
  return {
    enabled: Boolean(row.enabled),
    dryRun: Boolean(row.dry_run),
    model: String(row.model ?? 'claude-opus-5'),
    monthlyAiBudgetUsd: Number(row.monthly_ai_budget_usd ?? 0),
    hunterMonthlyCreditBudget: Number(row.hunter_monthly_credit_budget ?? 0),
    hunterCreditSafetyPct: Number(row.hunter_credit_safety_pct ?? 90),
    hunterCycleDay: Number(row.hunter_cycle_day ?? 1),
    dailySendCap: Number(row.daily_send_cap ?? 0),
    perDomainOpenCap: Number(row.per_domain_open_cap ?? 1),
    maxFollowUps: Number(row.max_follow_ups ?? 0),
    followUpGapDays: Number(row.follow_up_gap_days ?? 4),
    sendFrom: (row.send_from as string) ?? undefined,
    sendReplyTo: (row.send_reply_to as string) ?? undefined,
    crawlMaxPages: Number(row.crawl_max_pages ?? 6),
    minScoreToContact: Number(row.min_score_to_contact ?? 50),
    updatedAt: String(row.updated_at ?? ''),
    updatedBy: (row.updated_by as string) ?? undefined,
  };
}

export const salesSettingsService = {
  async get(): Promise<SalesSettings | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('sales_settings')
      .select(SELECT)
      .eq('id', true)
      .maybeSingle();

    if (error) throw new Error(`Could not read the sales settings: ${error.message}`);
    return data ? map(data as Row) : null;
  },

  async update(
    patch: Partial<Omit<SalesSettings, 'updatedAt' | 'updatedBy'>>,
    updatedBy?: string,
  ): Promise<SalesSettings | null> {
    if (!isSupabaseEnabled()) return null;

    const row: Row = { updated_by: updatedBy ?? null };
    const put = (key: string, value: unknown) => {
      if (value !== undefined) row[key] = value;
    };

    put('enabled', patch.enabled);
    put('dry_run', patch.dryRun);
    put('model', patch.model);
    put('monthly_ai_budget_usd', patch.monthlyAiBudgetUsd);
    put('hunter_monthly_credit_budget', patch.hunterMonthlyCreditBudget);
    put('hunter_credit_safety_pct', patch.hunterCreditSafetyPct);
    put('hunter_cycle_day', patch.hunterCycleDay);
    put('daily_send_cap', patch.dailySendCap);
    put('per_domain_open_cap', patch.perDomainOpenCap);
    put('max_follow_ups', patch.maxFollowUps);
    put('follow_up_gap_days', patch.followUpGapDays);
    // Empty means "unset", not an empty address: a from-field of '' would be
    // accepted here and rejected by the mail provider at send time.
    put('send_from', patch.sendFrom === undefined ? undefined : patch.sendFrom || null);
    put('send_reply_to', patch.sendReplyTo === undefined ? undefined : patch.sendReplyTo || null);
    put('crawl_max_pages', patch.crawlMaxPages);
    put('min_score_to_contact', patch.minScoreToContact);

    const { data, error } = await getAdminScopedClient()
      .from('sales_settings')
      .update(row)
      .eq('id', true)
      .select(SELECT)
      .maybeSingle();

    if (error) throw new Error(`Could not update the sales settings: ${error.message}`);
    return data ? map(data as Row) : null;
  },

  /**
   * What has been spent, measured.
   *
   * Both figures come from ledgers rather than from estimates: Hunter credits
   * from what Hunter charged on each call, model cost from the tokens the API
   * reported. The ceiling is the budget times the safety share, which is the
   * number a lookup is actually refused at - the same distinction
   * `refresh_settings.budget_safety_pct` draws, and for the same reason: the
   * allowance is shared with whatever else uses the account.
   */
  async spend(): Promise<{
    hunterCreditsUsed: number;
    hunterCreditBudget: number;
    hunterCeiling: number;
    aiSpendUsd: number;
    aiBudgetUsd: number;
  } | null> {
    if (!isSupabaseEnabled()) return null;

    const supabase = getAdminScopedClient();
    const settings = await salesSettingsService.get();
    if (!settings) return null;

    const [credits, ai] = await Promise.all([
      supabase.rpc('hunter_credits_this_cycle'),
      supabase.rpc('sales_ai_spend_this_month'),
    ]);

    if (credits.error) throw new Error(`Could not read Hunter credits: ${credits.error.message}`);
    if (ai.error) throw new Error(`Could not read model spend: ${ai.error.message}`);

    const budget = settings.hunterMonthlyCreditBudget;

    return {
      hunterCreditsUsed: Number(credits.data ?? 0),
      hunterCreditBudget: budget,
      hunterCeiling: Math.floor((budget * settings.hunterCreditSafetyPct) / 100),
      aiSpendUsd: Number(ai.data ?? 0),
      aiBudgetUsd: settings.monthlyAiBudgetUsd,
    };
  },
};
