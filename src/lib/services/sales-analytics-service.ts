import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { salesSettingsService } from './sales-settings-service';
import type { ProspectStage, SalesSegment } from '@/lib/types/sales';

/**
 * What the outbound programme is actually doing.
 *
 * Counted with `count: 'exact', head: true` rather than by reading rows and
 * measuring the array. That is not an optimisation: a count read from rows is
 * capped at a thousand by PostgREST, silently, so a funnel built that way
 * stops moving once any stage passes a thousand - and reads as a plateau
 * rather than as a bug.
 *
 * ## Two numbers nobody asks for until it is too late
 *
 * `sent` is counted, so is `replied`, and the reply rate between them is the
 * only number that says whether the emails are any good. A programme that
 * reports prospects and drafts and never reply rate is a programme measuring
 * its own activity.
 *
 * And the cost per reply, because the model and Hunter both bill. Outbound
 * that costs more per conversation than the conversation is worth is a
 * decision somebody should get to make on the figures.
 */

export interface SalesFunnel {
  prospects: number;
  researched: number;
  qualified: number;
  disqualified: number;
  withContact: number;
  drafted: number;
  awaitingReview: number;
  approved: number;
  sent: number;
  replied: number;
  interested: number;
  unsubscribed: number;
  customers: number;
}

export interface SalesHeadline {
  funnel: SalesFunnel;
  /** Replies as a share of emails sent. The only quality signal here. */
  replyRatePct: number;
  interestedRatePct: number;
  hunterCreditsUsed: number;
  hunterCreditBudget: number;
  aiSpendUsd: number;
  aiBudgetUsd: number;
  /** Total spend divided by replies. Undefined before the first reply. */
  costPerReplyUsd?: number;
  sentToday: number;
  dailySendCap: number;
  byStage: { stage: ProspectStage; count: number }[];
  bySegment: { segment: SalesSegment; count: number }[];
}

/**
 * Count rows without reading them.
 *
 * `head: true` means the server returns the count and no rows at all. Reading
 * rows and taking `.length` is capped at a thousand by PostgREST, silently, so
 * a funnel built that way stops moving once any stage passes a thousand - and
 * reads as a plateau rather than as a bug.
 */
async function countAll(table: string): Promise<number> {
  const { count } = await getAdminScopedClient()
    .from(table)
    .select('id', { count: 'exact', head: true });
  return Number(count ?? 0);
}

async function countWhere(table: string, column: string, value: unknown): Promise<number> {
  const { count } = await getAdminScopedClient()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  return Number(count ?? 0);
}

async function countIn(table: string, column: string, values: unknown[]): Promise<number> {
  const { count } = await getAdminScopedClient()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .in(column, values);
  return Number(count ?? 0);
}

export const salesAnalyticsService = {
  async headline(): Promise<SalesHeadline | null> {
    if (!isSupabaseEnabled()) return null;

    const supabase = getAdminScopedClient();
    const settings = await salesSettingsService.get();
    const spend = await salesSettingsService.spend();

    const [
      prospects,
      researched,
      qualified,
      disqualified,
      withContact,
      drafted,
      awaitingReview,
      approved,
      sent,
      replied,
      interested,
      unsubscribed,
      customers,
    ] = await Promise.all([
      countAll('prospects'),
      countWhere('prospects', 'research_status', 'done'),
      countWhere('prospects', 'qualified', true),
      countWhere('prospects', 'qualified', false),
      countWhere('prospects', 'contacts_status', 'found'),
      countAll('outbound_emails'),
      countIn('outbound_emails', 'status', ['draft', 'needs_review']),
      countIn('outbound_emails', 'status', ['approved', 'scheduled']),
      countWhere('outbound_emails', 'status', 'sent'),
      countAll('sales_replies'),
      countWhere('sales_replies', 'classification', 'interested'),
      countAll('sales_suppressions'),
      countAll('prospect_attributions'),
    ]);

    const { data: stageRows } = await supabase.from('prospects').select('stage');
    const { data: segmentRows } = await supabase.from('prospects').select('segment');

    /*
      These two read rows rather than counting, and they are the only ones.

      A group-by needs the values, and PostgREST has no grouping - so the cap
      applies. It is acceptable here and nowhere else above: a stage
      distribution over the first thousand prospects is a usable shape, while a
      funnel that stops counting at a thousand is a wrong number presented as a
      right one.
    */
    const byStage = tally(
      ((stageRows ?? []) as { stage: ProspectStage }[]).map((row) => row.stage),
    ).map((entry) => ({ stage: entry.value, count: entry.count }));

    const bySegment = tally(
      ((segmentRows ?? []) as { segment: SalesSegment }[]).map((row) => row.segment),
    ).map((entry) => ({ segment: entry.value, count: entry.count }));

    const { data: sentToday } = await supabase.rpc('sales_sent_today');

    const totalSpendUsd = spend?.aiSpendUsd ?? 0;

    return {
      funnel: {
        prospects,
        researched,
        qualified,
        disqualified,
        withContact,
        drafted,
        awaitingReview,
        approved,
        sent,
        replied,
        interested,
        unsubscribed,
        customers,
      },
      replyRatePct: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
      interestedRatePct: sent > 0 ? Math.round((interested / sent) * 1000) / 10 : 0,
      hunterCreditsUsed: spend?.hunterCreditsUsed ?? 0,
      hunterCreditBudget: spend?.hunterCreditBudget ?? 0,
      aiSpendUsd: totalSpendUsd,
      aiBudgetUsd: spend?.aiBudgetUsd ?? 0,
      // Undefined rather than Infinity or zero: "no replies yet" is a
      // different statement from "costs nothing per reply".
      costPerReplyUsd: replied > 0 ? Math.round((totalSpendUsd / replied) * 100) / 100 : undefined,
      sentToday: Number(sentToday ?? 0),
      dailySendCap: settings?.dailySendCap ?? 0,
      byStage,
      bySegment,
    };
  },
};

function tally<T extends string>(values: T[]): { value: T; count: number }[] {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));
}
