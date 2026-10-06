import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { estimateCostUsd, getClient, isExtractionConfigured, messageFor } from '@/lib/sourcing/client';
import { emailService } from './email-service';
import { prospectService } from './prospect-service';
import { salesRunService } from './sales-run-service';
import { salesSettingsService } from './sales-settings-service';
import { websiteService } from './website-service';
import { segmentDefinition } from '@/lib/config/sales-segments';
import { inventorySummary, matchInventory } from '@/lib/sales/inventory-match';
import {
  EMAIL_PROMPT_VERSION,
  EMAIL_RULES,
  buildEmailBrief,
  checkDraft,
  type DraftProblem,
  type EmailBrief,
} from '@/lib/sales/email-rules';
import { renderOutbound, splitSubjectFromBody } from '@/lib/sales/email-render';
import { siteUrl } from '@/lib/config/brand';
import type { MatchedListing, OutboundEmail, OutboundStatus } from '@/lib/types/sales';

/**
 * Writing, reviewing and sending outbound email.
 *
 * Three stages, and the boundaries between them are the point.
 *
 * **Writing** produces a row at `needs_review`. Never `approved`, never
 * `sent`, and not because a flag is set that way - the trigger on
 * `outbound_emails` refuses the transition without a named approver, so there
 * is no code path here or anywhere later that can skip the person. That is the
 * same arrangement `draft-approval.ts` has for publisher listings, for the
 * same reason: the model proposes.
 *
 * **Reviewing** is a human reading it. The draft arrives with whatever
 * `checkDraft` found wrong - an invented price, an implied conversation that
 * never happened - stated on the row rather than left to be noticed, because a
 * queue of forty drafts that all look fine is a queue nobody reads carefully.
 *
 * **Sending** takes only what `sales_sendable` hands it: approved, due, not
 * suppressed, inside the daily cap, one per company. Every one of those
 * conditions is in SQL, so the caller cannot forget one.
 */

const DEFAULT_BUDGET_MS = 240_000;

/** Room for a 130-word email and a subject. Generous; billed on output. */
const MAX_TOKENS = 2_000;

const draftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

const EMAIL_SELECT = `
  id, prospect_id, contact_id, campaign_id, step_number, to_address, subject,
  body_text, body_html, status, status_reason, matched_inventory, model,
  prompt_version, input_tokens, output_tokens, cost_usd, edited, reviewed_by,
  reviewed_at, approved_by, approved_at, scheduled_at, sent_at, provider_id,
  error, created_at, updated_at
`;

type Row = Record<string, unknown>;

function mapEmail(row: Row): OutboundEmail {
  return {
    id: String(row.id),
    prospectId: String(row.prospect_id),
    contactId: (row.contact_id as string) ?? undefined,
    campaignId: (row.campaign_id as string) ?? undefined,
    stepNumber: Number(row.step_number ?? 1),
    toAddress: String(row.to_address),
    subject: String(row.subject ?? ''),
    bodyText: String(row.body_text ?? ''),
    bodyHtml: (row.body_html as string) ?? undefined,
    status: row.status as OutboundStatus,
    statusReason: (row.status_reason as string) ?? undefined,
    matchedInventory: (row.matched_inventory as MatchedListing[]) ?? [],
    model: (row.model as string) ?? undefined,
    promptVersion: (row.prompt_version as string) ?? undefined,
    inputTokens: row.input_tokens === null ? undefined : Number(row.input_tokens),
    outputTokens: row.output_tokens === null ? undefined : Number(row.output_tokens),
    costUsd: row.cost_usd === null ? undefined : Number(row.cost_usd),
    edited: Boolean(row.edited),
    reviewedBy: (row.reviewed_by as string) ?? undefined,
    reviewedAt: (row.reviewed_at as string) ?? undefined,
    approvedBy: (row.approved_by as string) ?? undefined,
    approvedAt: (row.approved_at as string) ?? undefined,
    scheduledAt: (row.scheduled_at as string) ?? undefined,
    sentAt: (row.sent_at as string) ?? undefined,
    providerId: (row.provider_id as string) ?? undefined,
    error: (row.error as string) ?? undefined,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export interface DraftOutcome {
  ok: boolean;
  emailId?: string;
  problems?: DraftProblem[];
  error?: string;
  costUsd?: number;
}

export const salesEmailService = {
  /**
   * Write one email.
   *
   * Everything the model is given comes from our own data: the prospect's
   * verified quotes, and listings from the live inventory with the prices
   * customers would actually pay. Nothing is described to it in general terms,
   * because a model given "we have lots of good sites" writes a number.
   */
  async draft(
    prospectId: string,
    options: { campaignId?: string; stepNumber?: number; actor?: string; senderFirstName?: string } = {},
  ): Promise<DraftOutcome> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };
    if (!isExtractionConfigured()) {
      return { ok: false, error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel and redeploy.' };
    }

    const settings = await salesSettingsService.get();
    if (!settings) return { ok: false, error: 'No sales settings' };
    if (!settings.enabled) {
      return { ok: false, error: 'The Sales Centre is off. Turn it on in Sales settings first.' };
    }

    const spend = await salesSettingsService.spend();
    if (spend && spend.aiBudgetUsd > 0 && spend.aiSpendUsd >= spend.aiBudgetUsd) {
      return {
        ok: false,
        error:
          `The model budget for this month is spent: $${spend.aiSpendUsd.toFixed(2)} of ` +
          `$${spend.aiBudgetUsd.toFixed(2)}.`,
      };
    }

    const prospect = await prospectService.getById(prospectId);
    if (!prospect) return { ok: false, error: 'No such prospect' };

    if (prospect.segment === 'publisher_network') {
      return {
        ok: false,
        error: 'A publisher or marketplace. They sell what we sell, so nothing is written to them.',
      };
    }

    const contacts = await prospectService.contacts(prospectId);
    const recipient = contacts.find((contact) => contact.selected);
    if (!recipient) {
      return { ok: false, error: 'No recipient chosen. Find or add a contact first.' };
    }

    /*
      Suppression, checked here as well as by the trigger.

      The trigger is the guarantee and this is the courtesy: it is better to
      tell somebody the company has unsubscribed than to let them write and
      approve a draft that is refused at the last step with a database error.
    */
    const suppressed = await salesEmailService.isSuppressed(recipient.email);
    if (suppressed) {
      return { ok: false, error: `${recipient.email} is on the do-not-contact list.` };
    }

    const stepNumber = options.stepNumber ?? 1;

    // The inventory, read once. `getAll` pages internally, so the whole
    // marketplace arrives rather than its first thousand rows.
    const inventory = await websiteService.getAll();
    const niches = segmentDefinition(prospect.segment).niches;
    const matched = matchInventory(inventory, prospect.segment, { limit: 3, niches });
    const summary = inventorySummary(inventory, prospect.segment, { niches });

    const qualifications = await prospectService.qualifications(prospectId);
    const latest = qualifications[0];

    const previous =
      stepNumber > 1 ? await salesEmailService.previousStep(prospectId, options.campaignId, stepNumber) : null;

    const campaign = options.campaignId ? await salesEmailService.campaign(options.campaignId) : null;

    const brief: EmailBrief = {
      companyName: prospect.companyName,
      domain: prospect.domain,
      segment: prospect.segment,
      // Only the quotes that survived verification against their own pages.
      quotes: [...(latest?.reasons ?? []), ...(latest?.buyingSignals ?? [])].slice(0, 4),
      listings: matched.listings,
      inventory: summary ?? undefined,
      contactFirstName: recipient.firstName,
      contactRole: recipient.role,
      senderFirstName: options.senderFirstName ?? firstNameOf(settings.sendFrom) ?? 'Sam',
      angle: campaign?.angle || segmentDefinition(prospect.segment).angle,
      stepNumber,
      previousSubject: previous?.subject,
      previousBody: previous?.bodyText,
    };

    let subject = '';
    let body = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const response = await getClient().messages.create({
        model: settings.model,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: 'text' as const,
            text: EMAIL_RULES,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: buildEmailBrief(brief) }],
        output_config: { format: zodOutputFormat(draftSchema) },
      });

      inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
      outputTokens = response.usage.output_tokens;

      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      const parsed = draftSchema.safeParse(JSON.parse(text) as unknown);
      if (!parsed.success) {
        return { ok: false, error: 'The model did not return a subject and a body.' };
      }

      // A model that puts "Subject: ..." at the top of the body has happened
      // to every prompt that ever asked for both.
      const split = splitSubjectFromBody(parsed.data.body);
      subject = (parsed.data.subject || split.subject || '').trim();
      body = split.body;
    } catch (error) {
      return { ok: false, error: messageFor(error) };
    }

    if (!subject || !body) return { ok: false, error: 'The model returned an empty draft.' };

    /*
      Checked before anybody is asked to read it.

      Not style - facts. A price the model was not given is a price we never
      set, and a queue of forty drafts that all look fine is a queue nobody
      reads carefully. So what is wrong goes on the row.
    */
    const problems = checkDraft({ subject, body }, brief);

    const rendered = renderOutbound({
      bodyText: body,
      senderFirstName: brief.senderFirstName,
      senderEmail: settings.sendReplyTo ?? settings.sendFrom,
      unsubscribeToken: prospect.publicToken,
      siteUrl,
    });

    const costUsd = estimateCostUsd(settings.model, { inputTokens, outputTokens }, 'realtime');

    const { data, error } = await getAdminScopedClient()
      .from('outbound_emails')
      .upsert(
        {
          prospect_id: prospectId,
          contact_id: recipient.id,
          campaign_id: options.campaignId ?? null,
          step_number: stepNumber,
          to_address: recipient.email,
          subject: subject.slice(0, 300),
          body_text: rendered.text,
          body_html: rendered.html,
          status: 'needs_review',
          status_reason:
            problems.length > 0
              ? problems.map((problem) => problem.detail).join(' ').slice(0, 500)
              : null,
          matched_inventory: matched.listings,
          model: settings.model,
          prompt_version: EMAIL_PROMPT_VERSION,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: costUsd,
        },
        { onConflict: 'prospect_id,campaign_id,step_number' },
      )
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message, costUsd };

    await prospectService.recordEvent(prospectId, {
      kind: 'email_drafted',
      summary:
        `Step ${stepNumber} drafted for ${recipient.email}` +
        (problems.length > 0 ? ` - ${problems.length} thing${problems.length === 1 ? '' : 's'} to check` : ''),
      detail: { problems, costUsd, listings: matched.listings.map((listing) => listing.domain) },
      actor: options.actor,
    });

    return {
      ok: true,
      emailId: data ? String((data as Row).id) : undefined,
      problems,
      costUsd,
    };
  },

  async isSuppressed(email: string): Promise<boolean> {
    if (!isSupabaseEnabled()) return false;

    const { data, error } = await getAdminScopedClient().rpc('sales_is_suppressed', {
      p_email: email,
    });
    if (error) {
      // Fail closed. Not knowing whether somebody unsubscribed is not a reason
      // to write to them: the trigger would refuse the send anyway, and a
      // false "suppressed" costs one email while a false "clear" costs trust.
      console.error('[sales] could not check suppression:', error.message.slice(0, 200));
      return true;
    }
    return Boolean(data);
  },

  async previousStep(
    prospectId: string,
    campaignId: string | undefined,
    stepNumber: number,
  ): Promise<OutboundEmail | null> {
    if (!isSupabaseEnabled()) return null;

    let query = getAdminScopedClient()
      .from('outbound_emails')
      .select(EMAIL_SELECT)
      .eq('prospect_id', prospectId)
      .lt('step_number', stepNumber)
      .order('step_number', { ascending: false })
      .limit(1);

    query = campaignId ? query.eq('campaign_id', campaignId) : query.is('campaign_id', null);

    const { data } = await query.maybeSingle();
    return data ? mapEmail(data as Row) : null;
  },

  async campaign(campaignId: string): Promise<{ angle: string; fromAddress?: string } | null> {
    if (!isSupabaseEnabled()) return null;

    const { data } = await getAdminScopedClient()
      .from('sales_campaigns')
      .select('angle, from_address')
      .eq('id', campaignId)
      .maybeSingle();

    if (!data) return null;
    const row = data as Row;
    return { angle: String(row.angle ?? ''), fromAddress: (row.from_address as string) ?? undefined };
  },

  /** The review queue, oldest first - a draft nobody read is not improving. */
  async awaitingReview(limit = 100): Promise<OutboundEmail[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('outbound_emails')
      .select(EMAIL_SELECT)
      .in('status', ['draft', 'needs_review'])
      .order('created_at')
      .limit(limit);

    if (error) throw new Error(`Could not read the review queue: ${error.message}`);
    return (data ?? []).map((row) => mapEmail(row as Row));
  },

  async getById(id: string): Promise<OutboundEmail | null> {
    if (!isSupabaseEnabled()) return null;

    const { data, error } = await getAdminScopedClient()
      .from('outbound_emails')
      .select(EMAIL_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Could not read that email: ${error.message}`);
    return data ? mapEmail(data as Row) : null;
  },

  async forProspect(prospectId: string): Promise<OutboundEmail[]> {
    if (!isSupabaseEnabled()) return [];

    const { data, error } = await getAdminScopedClient()
      .from('outbound_emails')
      .select(EMAIL_SELECT)
      .eq('prospect_id', prospectId)
      .order('step_number');

    if (error) throw new Error(`Could not read this prospect's emails: ${error.message}`);
    return (data ?? []).map((row) => mapEmail(row as Row));
  },

  /**
   * Edit a draft.
   *
   * Marks it `edited`, which is worth knowing later: if the emails people
   * rewrite before sending all change the same thing, the prompt is wrong and
   * the edits are the evidence.
   *
   * Re-checks the facts after the edit. A reviewer fixing a sentence can
   * introduce a price as easily as the model can, and an edited draft that
   * skipped the check would be the one nobody looked at twice.
   */
  async edit(
    id: string,
    patch: { subject?: string; bodyText?: string },
    actor?: string,
  ): Promise<{ ok: boolean; problems?: DraftProblem[]; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const existing = await salesEmailService.getById(id);
    if (!existing) return { ok: false, error: 'No such email' };
    if (existing.status === 'sent') return { ok: false, error: 'That email has already gone.' };

    const subject = patch.subject?.trim() || existing.subject;
    const bodyText = patch.bodyText?.trim() || existing.bodyText;

    const prospect = await prospectService.getById(existing.prospectId);
    const problems = prospect
      ? checkDraft(
          { subject, body: bodyText },
          {
            companyName: prospect.companyName,
            domain: prospect.domain,
            segment: prospect.segment,
            quotes: [],
            listings: existing.matchedInventory,
            senderFirstName: '',
            stepNumber: existing.stepNumber,
          },
        )
      : [];

    const { error } = await getAdminScopedClient()
      .from('outbound_emails')
      .update({
        subject: subject.slice(0, 300),
        body_text: bodyText,
        edited: true,
        status_reason:
          problems.length > 0 ? problems.map((problem) => problem.detail).join(' ').slice(0, 500) : null,
        reviewed_by: actor ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };
    return { ok: true, problems };
  },

  /**
   * Approve, and schedule.
   *
   * The approver's address is recorded because the trigger demands it and
   * because "who said this could go" is the question that matters afterwards.
   * `scheduled_at` left unset means "as soon as the sender runs", which is
   * what approving one by hand should mean.
   */
  async approve(
    id: string,
    actor: string,
    options: { sendAt?: string } = {},
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const email = await salesEmailService.getById(id);
    if (!email) return { ok: false, error: 'No such email' };

    const { error } = await getAdminScopedClient()
      .from('outbound_emails')
      .update({
        status: options.sendAt ? 'scheduled' : 'approved',
        approved_by: actor,
        approved_at: new Date().toISOString(),
        reviewed_by: email.reviewedBy ?? actor,
        reviewed_at: email.reviewedAt ?? new Date().toISOString(),
        scheduled_at: options.sendAt ?? null,
        status_reason: null,
      })
      .eq('id', id);

    if (error) {
      /*
        The trigger refusing is not a bug to work around.

        It raises when the address is suppressed, which means somebody asked us
        to stop between the draft being written and this click. The message is
        passed through so the reviewer understands it was refused rather than
        broken.
      */
      return { ok: false, error: error.message };
    }

    await prospectService.recordEvent(email.prospectId, {
      kind: 'email_approved',
      summary: `Step ${email.stepNumber} approved by ${actor}`,
      actor,
    });

    return { ok: true };
  },

  async cancel(id: string, actor: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const email = await salesEmailService.getById(id);
    if (!email) return { ok: false, error: 'No such email' };

    const { error } = await getAdminScopedClient()
      .from('outbound_emails')
      .update({ status: 'cancelled', status_reason: reason ?? null })
      .eq('id', id);

    if (error) return { ok: false, error: error.message };

    await prospectService.recordEvent(email.prospectId, {
      kind: 'email_cancelled',
      summary: `Step ${email.stepNumber} cancelled${reason ? `: ${reason}` : ''}`,
      actor,
    });

    return { ok: true };
  },

  async startSendRun(by?: string): Promise<string | null> {
    const settings = await salesSettingsService.get();
    return salesRunService.claim('send', settings?.dryRun ?? true, by);
  },

  /**
   * Send what is due.
   *
   * The queue comes from `sales_sendable`, which is where approved, due, not
   * suppressed, inside the daily cap and one-per-company all live. None of
   * those conditions is re-implemented here, because five conditions in two
   * places is four that can disagree.
   *
   * In dry run nothing is sent and nothing is marked sent. The run records
   * what it would have done, which is the only way to check the queue is right
   * before it is right about real people.
   */
  async advanceSendRun(budgetMs = DEFAULT_BUDGET_MS): Promise<{
    idle: boolean;
    sent: number;
    failed: number;
    wouldSend: number;
    finished: boolean;
    outOfTime: boolean;
    reason?: string;
  }> {
    const idle = {
      idle: true,
      sent: 0,
      failed: 0,
      wouldSend: 0,
      finished: false,
      outOfTime: false,
    };

    if (!isSupabaseEnabled()) return idle;

    const run = await salesRunService.live('send');
    if (!run) return idle;

    const settings = await salesSettingsService.get();
    if (!settings?.enabled) {
      await salesRunService.finish(run.id, { status: 'skipped', reason: 'The Sales Centre is off.' });
      return { ...idle, idle: false, finished: true, reason: 'The Sales Centre is off.' };
    }

    if (!settings.sendFrom && !settings.dryRun) {
      const reason = 'No sending address is set. Add one in Sales settings.';
      await salesRunService.finish(run.id, { status: 'skipped', reason });
      return { ...idle, idle: false, finished: true, reason };
    }

    const started = Date.now();
    const supabase = getAdminScopedClient();
    const total = { sent: 0, failed: 0, wouldSend: 0 };
    let outOfTime = false;

    /** Small batches, re-asked, because the cap moves as we send. */
    const BATCH = 10;

    for (;;) {
      if (Date.now() - started > budgetMs) {
        outOfTime = true;
        break;
      }

      const { data, error } = await supabase.rpc('sales_sendable', { p_limit: BATCH });
      if (error) {
        await salesRunService.finish(run.id, { status: 'failed', error: error.message });
        return { idle: false, ...total, finished: true, outOfTime: false, reason: error.message };
      }

      const due = (data ?? []) as {
        id: string;
        prospect_id: string;
        to_address: string;
        subject: string;
        body_text: string;
        body_html: string | null;
        step_number: number;
      }[];

      if (due.length === 0) break;

      if (settings.dryRun) {
        /*
          Counted, then stopped.

          Nothing is marked, so the same batch would come back next time -
          which is why the dry run reports what it found and ends rather than
          looping on it forever.
        */
        total.wouldSend = due.length;
        await salesRunService.progress(run.id, { looked: due.length });
        await salesRunService.finish(run.id, {
          status: 'completed',
          reason: `Dry run: ${due.length} email${due.length === 1 ? '' : 's'} would have gone now.`,
        });
        return { idle: false, ...total, finished: true, outOfTime: false };
      }

      for (const entry of due) {
        if (Date.now() - started > budgetMs) {
          outOfTime = true;
          break;
        }

        const result = await emailService.send({
          to: entry.to_address,
          subject: entry.subject,
          text: entry.body_text,
          html: entry.body_html ?? entry.body_text,
          template: `sales-outbound-step-${entry.step_number}`,
          replyTo: settings.sendReplyTo ?? undefined,
          /*
            One key per email row, so a retry after a timeout is one email at
            the provider rather than two in somebody's inbox.
          */
          idempotencyKey: `sales-${entry.id}`,
        });

        if (result.sent) {
          await supabase
            .from('outbound_emails')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              error: null,
            })
            .eq('id', entry.id);

          await supabase
            .from('prospects')
            .update({ stage: 'contacted', last_contacted_at: new Date().toISOString() })
            .eq('id', entry.prospect_id);

          await prospectService.recordEvent(entry.prospect_id, {
            kind: 'email_sent',
            summary: `Step ${entry.step_number} sent to ${entry.to_address}`,
            actor: run.startedBy,
          });

          total.sent += 1;
        } else {
          await supabase
            .from('outbound_emails')
            .update({
              status: 'failed',
              error: (result.reason ?? 'Send failed').slice(0, 300),
            })
            .eq('id', entry.id);

          total.failed += 1;
        }

        await salesRunService.progress(run.id, {
          looked: 1,
          succeeded: result.sent ? 1 : 0,
          failed: result.sent ? 0 : 1,
        });
      }

      if (outOfTime) break;
    }

    if (outOfTime) {
      await salesRunService.release(run.id);
      return { idle: false, ...total, finished: false, outOfTime: true };
    }

    await salesRunService.finish(run.id, { status: 'completed' });
    return { idle: false, ...total, finished: true, outOfTime: false };
  },
};

/** The sender's first name, from the address we send as. */
function firstNameOf(address?: string): string | undefined {
  if (!address) return undefined;
  const local = address.split('@')[0] ?? '';
  const first = local.split(/[._-]/)[0] ?? '';
  if (!first || first.length < 2) return undefined;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
