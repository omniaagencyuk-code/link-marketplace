import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { estimateCostUsd, getClient, isExtractionConfigured, messageFor } from '@/lib/sourcing/client';
import {
  REPLY_PROMPT_VERSION,
  REPLY_RULES,
  buildReplyMessage,
  looksAutomatic,
  looksLikeStop,
  wireReplySchema,
} from '@/lib/sales/reply-rules';
import { prospectService } from './prospect-service';
import { salesSettingsService } from './sales-settings-service';
import type { ReplyClassification, SalesReply } from '@/lib/types/sales';

/**
 * Replies to our outreach, read and routed.
 *
 * ## The one thing that has to be right
 *
 * An `unsubscribe` reply suppresses the whole company and cancels everything
 * queued for them, and there is no button that undoes a suppression. So the
 * decision is made by two independent things and either of them is enough:
 * a phrase match, and the model. The phrase match can override a confident
 * model; the model can never override a phrase match.
 *
 * That asymmetry is the design. A missed unsubscribe is an email to somebody
 * who asked us to stop; a false one costs a prospect. Those are not comparable
 * errors, so they do not get comparable treatment.
 *
 * ## Out-of-office is checked first
 *
 * An absence reply carrying a marketing footer with "unsubscribe" in it would
 * otherwise suppress a company whose contact is on holiday. Automatic replies
 * are recognised before the stop phrases for that reason alone.
 *
 * ## Nothing here answers anybody
 *
 * A classification is a label, a stage and sometimes a suppression. Every
 * reply is still read by a person - the inbox exists so that reading them is
 * possible, not so that it can be skipped.
 */

const REPLY_SELECT = `
  id, prospect_id, outbound_email_id, contact_id, message_id, from_address,
  subject, body_text, received_at, classification, classified_by, confidence,
  handled, handled_by, handled_at, created_at
`;

type Row = Record<string, unknown>;

function map(row: Row): SalesReply {
  return {
    id: String(row.id),
    prospectId: (row.prospect_id as string) ?? undefined,
    outboundEmailId: (row.outbound_email_id as string) ?? undefined,
    contactId: (row.contact_id as string) ?? undefined,
    messageId: String(row.message_id),
    fromAddress: String(row.from_address),
    subject: (row.subject as string) ?? undefined,
    bodyText: String(row.body_text ?? ''),
    receivedAt: (row.received_at as string) ?? undefined,
    classification: (row.classification as ReplyClassification) ?? undefined,
    classifiedBy: (row.classified_by as 'ai' | 'human') ?? undefined,
    confidence: row.confidence === null ? undefined : Number(row.confidence),
    handled: Boolean(row.handled),
    handledBy: (row.handled_by as string) ?? undefined,
    handledAt: (row.handled_at as string) ?? undefined,
    createdAt: String(row.created_at ?? ''),
  };
}

/** Stages a reply moves a prospect to. `unsubscribe` also suppresses. */
const STAGE_FOR: Partial<Record<ReplyClassification, 'replied' | 'in_conversation' | 'lost' | 'unsubscribed'>> = {
  interested: 'in_conversation',
  question: 'in_conversation',
  not_now: 'replied',
  not_interested: 'lost',
  unsubscribe: 'unsubscribed',
  // An out-of-office and a bounce are not replies from a person, so neither
  // moves the prospect anywhere. Treating an absence note as "they replied"
  // would stop the follow-up that is the whole reason they are in the list.
};

export const salesReplyService = {
  /**
   * Record a reply and decide what it means.
   *
   * Idempotent on `message_id`: the same message arriving twice - from a
   * re-run, or from two mailboxes - is one row.
   */
  async record(input: {
    messageId: string;
    fromAddress: string;
    subject?: string;
    body: string;
    receivedAt?: string;
    actor?: string;
  }): Promise<{ ok: boolean; replyId?: string; classification?: ReplyClassification; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const supabase = getAdminScopedClient();
    const from = input.fromAddress.trim().toLowerCase();

    const { data: existing } = await supabase
      .from('sales_replies')
      .select('id, classification')
      .eq('message_id', input.messageId)
      .maybeSingle();

    if (existing) {
      const row = existing as Row;
      return {
        ok: true,
        replyId: String(row.id),
        classification: (row.classification as ReplyClassification) ?? undefined,
      };
    }

    /*
      Which prospect, matched on the address we wrote to and then on its
      domain.

      The domain fallback matters: a reply often comes from a colleague the
      first one forwarded it to, and a reply nobody can attach to a prospect
      is a reply that neither stops a follow-up nor moves a pipeline.
    */
    const { data: contactRow } = await supabase
      .from('prospect_contacts')
      .select('id, prospect_id')
      .eq('email', from)
      .maybeSingle();

    let prospectId = contactRow ? String((contactRow as Row).prospect_id) : null;
    const contactId = contactRow ? String((contactRow as Row).id) : null;

    if (!prospectId) {
      const domain = from.split('@')[1] ?? '';
      if (domain) {
        const { data: byDomain } = await supabase
          .from('prospects')
          .select('id')
          .eq('domain', domain)
          .maybeSingle();
        if (byDomain) prospectId = String((byDomain as Row).id);
      }
    }

    const { data: outbound } = prospectId
      ? await supabase
          .from('outbound_emails')
          .select('id, subject')
          .eq('prospect_id', prospectId)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const classified = await salesReplyService.classify({
      fromAddress: from,
      subject: input.subject,
      body: input.body,
      ourSubject: outbound ? String((outbound as Row).subject) : undefined,
    });

    const { data, error } = await supabase
      .from('sales_replies')
      .insert({
        prospect_id: prospectId,
        outbound_email_id: outbound ? String((outbound as Row).id) : null,
        contact_id: contactId,
        message_id: input.messageId,
        from_address: from,
        subject: input.subject?.slice(0, 500) ?? null,
        body_text: input.body.slice(0, 50_000),
        received_at: input.receivedAt ?? new Date().toISOString(),
        classification: classified.classification,
        classified_by: 'ai',
        confidence: classified.confidence,
      })
      .select('id')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    await salesReplyService.applyOutcome(
      prospectId,
      from,
      classified.classification,
      input.actor ?? 'inbox',
    );

    return {
      ok: true,
      replyId: data ? String((data as Row).id) : undefined,
      classification: classified.classification,
    };
  },

  /**
   * What the reply is, from two independent readings.
   *
   * The phrase match wins. It runs whether or not the model is configured,
   * so a deployment with no API key still honours an unsubscribe - which is
   * the one behaviour here that must not depend on a third party being
   * reachable.
   */
  async classify(input: {
    fromAddress: string;
    subject?: string;
    body: string;
    ourSubject?: string;
  }): Promise<{ classification: ReplyClassification; confidence: number; summary?: string }> {
    // First, because an absence note carrying a marketing footer must not
    // suppress a company whose contact is on holiday.
    if (looksAutomatic(input.subject ?? '', input.body)) {
      return { classification: 'out_of_office', confidence: 90 };
    }

    const stopped = looksLikeStop(`${input.subject ?? ''}\n${input.body}`);

    if (!isExtractionConfigured()) {
      return stopped
        ? { classification: 'unsubscribe', confidence: 95 }
        : { classification: 'other', confidence: 0 };
    }

    const settings = await salesSettingsService.get().catch(() => null);
    const model = settings?.model ?? 'claude-opus-5';

    try {
      const response = await getClient().messages.create({
        model,
        max_tokens: 1_000,
        system: [
          {
            type: 'text' as const,
            text: REPLY_RULES,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: buildReplyMessage(input) }],
        output_config: { format: zodOutputFormat(wireReplySchema) },
      });

      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      const parsed = wireReplySchema.safeParse(JSON.parse(text) as unknown);

      if (!parsed.success) {
        return stopped
          ? { classification: 'unsubscribe', confidence: 95 }
          : { classification: 'other', confidence: 0 };
      }

      /*
        The override, in one direction only.

        A phrase match beats the model; the model never beats a phrase match.
        A missed unsubscribe is an email to somebody who asked us to stop, and
        a false one costs a prospect. Those are not comparable errors.
      */
      if (stopped && parsed.data.classification !== 'unsubscribe') {
        return {
          classification: 'unsubscribe',
          confidence: 95,
          summary: `Read as "${parsed.data.classification}", but it asks us to stop.`,
        };
      }

      return {
        classification: parsed.data.classification,
        confidence: Math.max(0, Math.min(100, Math.round(parsed.data.confidence))),
        summary: parsed.data.summary,
      };
    } catch (error) {
      console.error('[sales] could not classify a reply:', messageFor(error).slice(0, 200));
      return stopped
        ? { classification: 'unsubscribe', confidence: 95 }
        : { classification: 'other', confidence: 0 };
    }
  },

  /**
   * Act on a classification.
   *
   * Suppression first, then the stage: the trigger on `outbound_emails` reads
   * the suppression table, so until that row exists a stage of `unsubscribed`
   * is a label on a company we would still email tomorrow.
   */
  async applyOutcome(
    prospectId: string | null,
    fromAddress: string,
    classification: ReplyClassification,
    actor: string,
  ): Promise<void> {
    if (!isSupabaseEnabled()) return;

    if (classification === 'unsubscribe') {
      /*
        Both: the address that wrote to us, and the company it belongs to.

        One person asking us to stop is the company asking us to stop -
        suppressing only their address leaves their colleague on the list, and
        the second email is the one that gets reported rather than ignored.
      */
      await prospectService.suppressEmail(fromAddress, 'unsubscribed', actor);
      const domain = fromAddress.split('@')[1];
      if (domain) await prospectService.suppressDomain(domain, 'unsubscribed', actor);
    }

    if (classification === 'bounce') {
      await prospectService.suppressEmail(fromAddress, 'bounced', actor);
    }

    if (!prospectId) return;

    const stage = STAGE_FOR[classification];
    const supabase = getAdminScopedClient();

    await supabase
      .from('prospects')
      .update({
        last_reply_at: new Date().toISOString(),
        ...(stage ? { stage } : {}),
      })
      .eq('id', prospectId);

    if (classification === 'unsubscribe' || classification === 'not_interested') {
      // Nothing queued should go now. The trigger would refuse a suppressed
      // send anyway, but a queue full of rows that can never go is a queue
      // nobody can read.
      await supabase
        .from('outbound_emails')
        .update({ status: 'cancelled', status_reason: `They replied: ${classification.replace(/_/g, ' ')}` })
        .eq('prospect_id', prospectId)
        .in('status', ['draft', 'needs_review', 'approved', 'scheduled']);
    }

    await prospectService.recordEvent(prospectId, {
      kind: 'reply_received',
      summary: `Replied - read as ${classification.replace(/_/g, ' ')}`,
      actor,
    });
  },

  async inbox(options: { handled?: boolean; limit?: number } = {}): Promise<SalesReply[]> {
    if (!isSupabaseEnabled()) return [];

    let query = getAdminScopedClient()
      .from('sales_replies')
      .select(REPLY_SELECT)
      .order('received_at', { ascending: false })
      .limit(options.limit ?? 100);

    if (options.handled !== undefined) query = query.eq('handled', options.handled);

    const { data, error } = await query;
    if (error) throw new Error(`Could not read the inbox: ${error.message}`);
    return (data ?? []).map((row) => map(row as Row));
  },

  async markHandled(replyId: string, actor: string): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const { error } = await getAdminScopedClient()
      .from('sales_replies')
      .update({ handled: true, handled_by: actor, handled_at: new Date().toISOString() })
      .eq('id', replyId);

    return error ? { ok: false, error: error.message } : { ok: true };
  },

  /**
   * Correct a classification by hand.
   *
   * Recorded as `human`, so a later look at how often the model was wrong is
   * answerable - and so a corrected row is never re-classified by a sweep.
   * Re-applies the outcome, which is the point: changing a label to
   * `unsubscribe` has to actually suppress them.
   */
  async reclassify(
    replyId: string,
    classification: ReplyClassification,
    actor: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };

    const supabase = getAdminScopedClient();

    const { data, error } = await supabase
      .from('sales_replies')
      .update({ classification, classified_by: 'human', confidence: 100 })
      .eq('id', replyId)
      .select('prospect_id, from_address')
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: 'No such reply' };

    const row = data as Row;
    await salesReplyService.applyOutcome(
      (row.prospect_id as string) ?? null,
      String(row.from_address),
      classification,
      actor,
    );

    return { ok: true };
  },

  /** Log a reply somebody received in their own mail client. */
  async logByHand(input: {
    fromAddress: string;
    subject?: string;
    body: string;
    actor: string;
  }): Promise<{ ok: boolean; classification?: ReplyClassification; error?: string }> {
    const from = input.fromAddress.trim().toLowerCase();
    if (!from.includes('@')) return { ok: false, error: 'That is not an email address.' };
    if (!input.body.trim()) return { ok: false, error: 'Paste what they wrote.' };

    return salesReplyService.record({
      // Synthetic, and marked as such: it is not a Message-ID and will never
      // match one, which keeps a hand-logged reply from colliding with the
      // real message if that is imported later.
      messageId: `manual:${from}:${Date.now()}`,
      fromAddress: from,
      subject: input.subject,
      body: input.body,
      actor: input.actor,
    });
  },
};
