import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { prospectService } from './prospect-service';
import { salesEmailService } from './sales-email-service';
import { salesSettingsService } from './sales-settings-service';
import { isContactable } from '@/lib/config/sales-segments';
import type { SalesCampaign, SalesSegment } from '@/lib/types/sales';

/**
 * Campaigns: a batch of drafts aimed at one kind of buyer.
 *
 * A campaign is not a sequence engine. It is a filter (segment, minimum
 * score), an angle, and a record of which prospects were written to under it -
 * so a run can be compared with the next one and the angle changed on
 * evidence rather than on taste.
 *
 * ## It drafts; it never sends
 *
 * Starting a campaign fills the review queue. Every email still has to be read
 * and approved one at a time, because a batch of forty is exactly where a bad
 * angle multiplies: the thing that would be caught instantly on one email goes
 * out forty times when the queue is skipped. The database would refuse the
 * send anyway - there is no bulk approve here, and that omission is the
 * feature.
 *
 * ## Who it skips
 *
 * A competitor, a prospect with no recipient chosen, anybody suppressed, and
 * anybody who already has an email for this campaign. Each is counted and
 * reported rather than silently dropped: "40 prospects, 12 drafted" with no
 * explanation is a bug report waiting to be filed.
 */

const SELECT = `
  id, name, status, segment, min_score, angle, daily_cap, from_address,
  reply_to, created_by, started_at, finished_at, created_at, updated_at
`;

type Row = Record<string, unknown>;

function map(row: Row): SalesCampaign {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    status: (row.status as SalesCampaign['status']) ?? 'draft',
    segment: (row.segment as SalesSegment) ?? undefined,
    minScore: row.min_score === null ? undefined : Number(row.min_score),
    angle: String(row.angle ?? ''),
    dailyCap: row.daily_cap === null ? undefined : Number(row.daily_cap),
    fromAddress: (row.from_address as string) ?? undefined,
    replyTo: (row.reply_to as string) ?? undefined,
    createdBy: (row.created_by as string) ?? undefined,
    startedAt: (row.started_at as string) ?? undefined,
    finishedAt: (row.finished_at as string) ?? undefined,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface CampaignProgress {
  campaign: SalesCampaign;
  drafted: number;
  approved: number;
  sent: number;
  replied: number;
}

export interface RunOutcome {
  considered: number;
  drafted: number;
  skipped: { reason: string; count: number }[];
  error?: string;
}

export const salesCampaignService = {
  async list(): Promise<SalesCampaign[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('sales_campaigns')
      .select(SELECT)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Could not read the campaigns: ${error.message}`);
    return (data ?? []).map((row) => map(row as Row));
  },

  async getById(id: string): Promise<SalesCampaign | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('sales_campaigns')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Could not read that campaign: ${error.message}`);
    return data ? map(data as Row) : null;
  },

  async create(
    input: { name: string; segment?: SalesSegment; minScore?: number; angle?: string },
    actor?: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const name = input.name.trim();
    if (!name) return { ok: false, error: 'Give it a name.' };

    const { data, error } = await getAdminScopedClient()
      .from('sales_campaigns')
      .insert({
        name: name.slice(0, 200),
        segment: input.segment ?? null,
        min_score: input.minScore ?? null,
        angle: (input.angle ?? '').trim().slice(0, 2000),
        created_by: actor ?? null,
      })
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data ? String((data as Row).id) : undefined };
  },

  async setStatus(
    id: string,
    status: SalesCampaign['status'],
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const { error } = await getAdminScopedClient()
      .from('sales_campaigns')
      .update({
        status,
        ...(status === 'active' ? { started_at: new Date().toISOString() } : {}),
        ...(status === 'done' || status === 'cancelled'
          ? { finished_at: new Date().toISOString() }
          : {}),
      })
      .eq('id', id);

    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /**
   * How a campaign is going.
   *
   * Counted from `outbound_emails` and `sales_replies` rather than kept on the
   * campaign row. A stored counter drifts the first time an email is cancelled
   * or a reply is reclassified, and the figure people plan from should not be
   * the one that is easiest to keep.
   */
  async progress(id: string): Promise<CampaignProgress | null> {
    if (!isSupabaseEnabled()) return null;

    const campaign = await salesCampaignService.getById(id);
    if (!campaign) return null;

    const supabase = getAdminScopedClient();

    const countEmails = async (statuses: string[]) => {
      const { count } = await supabase
        .from('outbound_emails')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .in('status', statuses);
      return Number(count ?? 0);
    };

    const [drafted, approved, sent] = await Promise.all([
      countEmails(['draft', 'needs_review']),
      countEmails(['approved', 'scheduled']),
      countEmails(['sent']),
    ]);

    const { data: sentRows } = await supabase
      .from('outbound_emails')
      .select('prospect_id')
      .eq('campaign_id', id)
      .eq('status', 'sent');

    const prospectIds = [...new Set(((sentRows ?? []) as Row[]).map((row) => String(row.prospect_id)))];

    let replied = 0;
    const ASK_AT_ONCE = 100;
    for (let index = 0; index < prospectIds.length; index += ASK_AT_ONCE) {
      const slice = prospectIds.slice(index, index + ASK_AT_ONCE);
      const { data } = await supabase
        .from('sales_replies')
        .select('prospect_id')
        .in('prospect_id', slice);
      replied += new Set(((data ?? []) as Row[]).map((row) => String(row.prospect_id))).size;
    }

    return { campaign, drafted, approved, sent, replied };
  },

  /**
   * Draft for everyone the campaign matches.
   *
   * Bounded by `limit` rather than running over the whole list, because the
   * drafts cost model tokens and land in a queue a person has to read. Forty
   * is a morning's reviewing; four hundred is a queue that gets approved
   * without being read, which is the failure this whole feature is arranged to
   * prevent.
   */
  async run(
    id: string,
    limit: number,
    actor?: string,
  ): Promise<RunOutcome> {
    const outcome: RunOutcome = { considered: 0, drafted: 0, skipped: [] };
    if (!isSupabaseEnabled()) return { ...outcome, error: 'No database' };

    const campaign = await salesCampaignService.getById(id);
    if (!campaign) return { ...outcome, error: 'No such campaign' };

    const settings = await salesSettingsService.get();
    if (!settings?.enabled) return { ...outcome, error: 'The Sales Centre is off.' };

    const minScore = campaign.minScore ?? settings.minScoreToContact;
    const candidates = await prospectService.list({
      qualifiedOnly: true,
      minScore,
      segment: campaign.segment,
    });

    const skipped = new Map<string, number>();
    const skip = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

    const supabase = getAdminScopedClient();

    for (const prospect of candidates) {
      if (outcome.drafted >= limit) break;
      outcome.considered += 1;

      // A competitor, which the score already zeroes - but a campaign with no
      // minimum score would otherwise reach them.
      if (!isContactable(prospect.segment)) {
        skip('a publisher or marketplace');
        continue;
      }

      if (prospect.stage !== 'qualified') {
        skip('already further along, or stopped');
        continue;
      }

      const contacts = await prospectService.contacts(prospect.id);
      if (!contacts.some((contact) => contact.selected)) {
        skip('no recipient chosen');
        continue;
      }

      const { count } = await supabase
        .from('outbound_emails')
        .select('id', { count: 'exact', head: true })
        .eq('prospect_id', prospect.id)
        .eq('campaign_id', id);

      if ((count ?? 0) > 0) {
        skip('already written to under this campaign');
        continue;
      }

      const draft = await salesEmailService.draft(prospect.id, {
        campaignId: id,
        stepNumber: 1,
        actor,
      });

      if (draft.ok) {
        outcome.drafted += 1;
      } else if (draft.error?.includes('budget for this month is spent')) {
        skip('the model budget is spent');
        break;
      } else if (draft.error?.includes('do-not-contact')) {
        skip('on the do-not-contact list');
      } else {
        skip(draft.error ?? 'could not be written');
      }
    }

    outcome.skipped = [...skipped.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return outcome;
  },
};
