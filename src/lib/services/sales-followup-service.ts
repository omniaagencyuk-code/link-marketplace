import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { salesEmailService } from './sales-email-service';
import { salesRunService } from './sales-run-service';
import { salesSettingsService } from './sales-settings-service';
import { prospectService } from './prospect-service';

/**
 * Writing the second email, and knowing when not to.
 *
 * A follow-up is the cheapest thing in outbound and the easiest to get wrong.
 * It gets written when all four of these hold, and the fourth is the one that
 * matters:
 *
 *   1. The previous step was sent.
 *   2. Long enough ago - `follow_up_gap_days`.
 *   3. We have not already used up `max_follow_ups`.
 *   4. **They have not replied, and they have not unsubscribed.**
 *
 * Replying and then receiving the follow-up anyway is the single most
 * annoying thing an outbound system does. It says plainly that nobody read the
 * reply, and it undoes whatever the reply was about to become. So the reply
 * check is a query against `sales_replies` and against the prospect's stage,
 * not an assumption that somebody moved them.
 *
 * Suppression is checked by `salesEmailService.draft` as well, and by the
 * trigger after that. Three checks for one rule is not redundancy here: the
 * trigger is the guarantee, the draft check is the courtesy, and this one is
 * what stops us paying a model to write an email that cannot be sent.
 */

export interface FollowUpOutcome {
  idle: boolean;
  looked: number;
  drafted: number;
  skipped: number;
  finished: boolean;
  reason?: string;
}

export const salesFollowUpService = {
  async startSweep(by?: string): Promise<string | null> {
    return salesRunService.claim('draft', false, by);
  },

  /**
   * Draft the next step for everyone due one.
   *
   * Drafts, never sends. The follow-up lands in the review queue exactly like
   * a first email, because an unread follow-up is as capable of quoting a
   * price nobody set as an unread first email.
   */
  async advanceSweep(budgetMs = 240_000): Promise<FollowUpOutcome> {
    const idle: FollowUpOutcome = {
      idle: true,
      looked: 0,
      drafted: 0,
      skipped: 0,
      finished: false,
    };

    if (!isSupabaseEnabled()) return idle;

    const run = await salesRunService.live('draft');
    if (!run) return idle;

    const settings = await salesSettingsService.get();
    if (!settings?.enabled) {
      await salesRunService.finish(run.id, { status: 'skipped', reason: 'The Sales Centre is off.' });
      return { ...idle, idle: false, finished: true, reason: 'The Sales Centre is off.' };
    }

    if (settings.maxFollowUps === 0) {
      const reason = 'Follow-ups are turned off (max follow-ups is zero).';
      await salesRunService.finish(run.id, { status: 'skipped', reason });
      return { ...idle, idle: false, finished: true, reason };
    }

    const supabase = getAdminScopedClient();
    const started = Date.now();
    const total = { looked: 0, drafted: 0, skipped: 0 };

    const dueBefore = new Date(
      Date.now() - settings.followUpGapDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    /*
      The last step sent per prospect, not every sent email.

      Asked as "sent, old enough, below the step ceiling" and then narrowed in
      code to the latest step per prospect. Doing it the other way - one row
      per prospect in SQL - needs a window function through an RPC, and the
      number of rows here is bounded by the daily send cap times the gap, which
      is tens rather than thousands.
    */
    const { data, error } = await supabase
      .from('outbound_emails')
      .select('id, prospect_id, campaign_id, step_number, sent_at')
      .eq('status', 'sent')
      .lte('sent_at', dueBefore)
      .lte('step_number', settings.maxFollowUps)
      .order('sent_at', { ascending: false })
      .limit(500);

    if (error) {
      await salesRunService.finish(run.id, { status: 'failed', error: error.message });
      return { ...idle, idle: false, finished: true, reason: error.message };
    }

    const rows = (data ?? []) as {
      id: string;
      prospect_id: string;
      campaign_id: string | null;
      step_number: number;
      sent_at: string;
    }[];

    const latestPerProspect = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const held = latestPerProspect.get(row.prospect_id);
      if (!held || row.step_number > held.step_number) latestPerProspect.set(row.prospect_id, row);
    }

    for (const row of latestPerProspect.values()) {
      if (Date.now() - started > budgetMs) break;
      total.looked += 1;

      const prospect = await prospectService.getById(row.prospect_id);
      if (!prospect) {
        total.skipped += 1;
        continue;
      }

      /*
        The check this whole module exists for.

        A reply, or a stage that says somebody is already talking to them, or
        an unsubscribe. Sending a follow-up over the top of a reply says
        plainly that nobody read it.
      */
      const stopped = ['replied', 'in_conversation', 'won', 'lost', 'unsubscribed', 'disqualified'];
      if (stopped.includes(prospect.stage) || prospect.lastReplyAt) {
        total.skipped += 1;
        continue;
      }

      const { count } = await supabase
        .from('sales_replies')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', row.prospect_id);

      if ((count ?? 0) > 0) {
        total.skipped += 1;
        continue;
      }

      // Already drafted or queued, from a previous run of this sweep.
      const { count: pending } = await supabase
        .from('outbound_emails')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', row.prospect_id)
        .eq('step_number', row.step_number + 1);

      if ((pending ?? 0) > 0) {
        total.skipped += 1;
        continue;
      }

      const outcome = await salesEmailService.draft(row.prospect_id, {
        campaignId: row.campaign_id ?? undefined,
        stepNumber: row.step_number + 1,
        actor: run.startedBy,
      });

      if (outcome.ok) total.drafted += 1;
      else total.skipped += 1;

      await salesRunService.progress(run.id, {
        looked: 1,
        succeeded: outcome.ok ? 1 : 0,
        failed: outcome.ok ? 0 : 1,
        costUsd: outcome.costUsd ?? 0,
      });

      // The budget closing mid-sweep ends it rather than failing every
      // remaining prospect.
      if (!outcome.ok && outcome.error?.includes('budget for this month is spent')) {
        await salesRunService.finish(run.id, { status: 'skipped', reason: outcome.error });
        return { idle: false, ...total, finished: true, reason: outcome.error };
      }
    }

    await salesRunService.finish(run.id, { status: 'completed' });
    return { idle: false, ...total, finished: true };
  },
};
