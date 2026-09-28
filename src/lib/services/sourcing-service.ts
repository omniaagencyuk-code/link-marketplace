import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { readMbox, readPastedEmail, type ParsedMessage } from '@/lib/sourcing/mbox';
import { gmailSearchUrl, gmailThreadUrl, type ReadThread } from '@/lib/gmail/thread';
import { extractLinks, type FoundLink } from '@/lib/sourcing/links';
import {
  ABANDON_AFTER_MINUTES,
  NEVER_SUBMITTED_AFTER_MINUTES,
  minutesSince,
} from '@/lib/sourcing/batch-health';
import {
  collectBatch,
  checkBatch,
  estimateCostUsd,
  extractNow,
  isExtractionConfigured,
  submitBatch,
  PROMPT_VERSION,
  type ExtractionOutcome,
  type ExtractionRequest,
} from '@/lib/sourcing/client';
import { countLowConfidence, expandListings, flagsFor } from '@/lib/sourcing/review';
import { asMap } from '@/lib/sourcing/schema';
import { EXTRACTION_BATCH_LIMIT } from '@/lib/sourcing/limits';

/**
 * Publisher sourcing: emails in, drafts out, nothing live without a human.
 *
 * Runs as the service role, like the rest of the admin, because the admin
 * signs in with a shared password and carries no auth.uid(). Every caller is
 * behind requireAdminSession().
 *
 * The order of operations is the point of this file. Ingestion dedupes on
 * Message-ID and stores; extraction only ever reads rows with status 'new'.
 * A second upload of the same export inserts nothing, so it finds nothing to
 * extract, so it costs nothing. That is a property of the sequence rather
 * than a check somebody has to remember to write.
 */

export interface SourcingSettings {
  enabled: boolean;
  mode: 'realtime' | 'batch';
  model: string;
  monthlyBudgetUsd: number;
  /** Clearing bodies is irreversible, so it is off until somebody says. */
  purgeBodiesEnabled: boolean;
  purgeBodiesAfterDays: number;
}

export interface RateCardLead {
  id: string;
  fromAddress: string;
  fromName: string | null;
  subject: string | null;
  sentAt: string | null;
  askedAboutDomain: string | null;
  /** Why extraction produced no draft. Usually names the missing rate card. */
  reason: string | null;
  attachments: { filename: string; mimeType: string; size: number }[];
  hasRateCard: boolean;
  links: FoundLink[];
  /** The thread itself, for emails that came in through Gmail. */
  gmailUrl: string | null;
  /** A search by Message-ID, which works for uploaded emails too. */
  findUrl: string | null;
}

export interface IngestResult {
  imported: number;
  /** Already present from an earlier upload. The reason a re-run is free. */
  duplicates: number;
  skipped: { reason: string; subject?: string; from?: string }[];
}

const DEFAULTS: SourcingSettings = {
  enabled: false,
  mode: 'realtime',
  model: 'claude-opus-5',
  monthlyBudgetUsd: 25,
  purgeBodiesEnabled: false,
  purgeBodiesAfterDays: 90,
};

export const sourcingService = {
  isEnabled(): boolean {
    return isSupabaseEnabled();
  },

  async getSettings(): Promise<SourcingSettings & { configured: boolean; reason?: string }> {
    const configured = isExtractionConfigured();
    if (!isSupabaseEnabled()) {
      return { ...DEFAULTS, configured, reason: 'The database is not connected on this deployment.' };
    }

    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.from('sourcing_settings').select('*').eq('id', 1).maybeSingle();

    if (error) {
      // Said out loud rather than swallowed: a missing table means migration
      // 0019 has not been run, and a silent default would look like a setting.
      return { ...DEFAULTS, configured, reason: `Could not read the settings: ${error.message}` };
    }
    if (!data) return { ...DEFAULTS, configured, reason: 'Migration 0019 has not been run yet.' };

    return {
      enabled: Boolean(data.enabled),
      mode: (data.mode as SourcingSettings['mode']) ?? 'realtime',
      model: (data.model as string) ?? DEFAULTS.model,
      monthlyBudgetUsd: Number(data.monthly_budget_usd ?? DEFAULTS.monthlyBudgetUsd),
      purgeBodiesEnabled: Boolean(data.purge_bodies_enabled),
      purgeBodiesAfterDays: Number(data.purge_bodies_after_days ?? DEFAULTS.purgeBodiesAfterDays),
      configured,
    };
  },

  async updateSettings(patch: Partial<SourcingSettings>, updatedBy?: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('sourcing_settings')
      .update({
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        ...(patch.mode === undefined ? {} : { mode: patch.mode }),
        ...(patch.model === undefined ? {} : { model: patch.model }),
        ...(patch.monthlyBudgetUsd === undefined
          ? {}
          : { monthly_budget_usd: patch.monthlyBudgetUsd }),
        ...(patch.purgeBodiesEnabled === undefined
          ? {}
          : { purge_bodies_enabled: patch.purgeBodiesEnabled }),
        ...(patch.purgeBodiesAfterDays === undefined
          ? {}
          : { purge_bodies_after_days: patch.purgeBodiesAfterDays }),
        updated_by: updatedBy ?? null,
      })
      .eq('id', 1);
  },

  // ------------------------------------------------------------- ingestion

  /**
   * Store an export.
   *
   * Message-ID carries a unique constraint, so a duplicate is refused by the
   * database rather than by a query that could race with itself. The insert
   * is chunked and conflicts are ignored, which makes re-uploading the same
   * file a no-op that reports how many it recognised.
   */
  async ingestMbox(raw: string): Promise<IngestResult> {
    const { messages, skipped } = readMbox(raw);
    return sourcingService.store(messages, skipped);
  },

  async ingestPasted(raw: string, fromAddress?: string): Promise<IngestResult> {
    const message = readPastedEmail(raw, fromAddress);
    if (!message) return { imported: 0, duplicates: 0, skipped: [{ reason: 'empty' }] };
    return sourcingService.store([message], []);
  },

  async store(messages: ParsedMessage[], skipped: IngestResult['skipped']): Promise<IngestResult> {
    if (messages.length === 0) return { imported: 0, duplicates: 0, skipped };

    const supabase = getAdminScopedClient();
    const ids = messages.map((message) => message.messageId);

    const { data: existing } = await supabase
      .from('inbound_emails')
      .select('message_id')
      .in('message_id', ids);

    const known = new Set(((existing ?? []) as { message_id: string }[]).map((row) => row.message_id));
    const fresh = messages.filter((message) => !known.has(message.messageId));

    if (fresh.length > 0) {
      const { error } = await supabase.from('inbound_emails').insert(
        fresh.map((message) => ({
          message_id: message.messageId,
          from_address: message.fromAddress,
          from_name: message.fromName ?? null,
          to_address: message.toAddress ?? null,
          subject: message.subject ?? null,
          sent_at: message.sentAt ?? null,
          body_text: message.bodyText,
          body_raw: message.bodyRaw,
          asked_about_domain: message.askedAboutDomain ?? null,
          status: 'new',
        })),
      );
      if (error) throw new Error(`Could not store the emails: ${error.message}`);
    }

    return { imported: fresh.length, duplicates: messages.length - fresh.length, skipped };
  },

  /**
   * One Gmail thread, as an ordinary inbound email.
   *
   * The join between the Gmail importer and everything that already exists.
   * A thread becomes one row with status 'new', which is precisely what an
   * uploaded message becomes, so extraction, review and approval need no
   * idea which route it came by.
   *
   * Dedupe is three checks because the same mail can arrive twice by two
   * different routes:
   *
   *   1. This mailbox and thread, imported before.
   *   2. Any Message-ID in the thread already stored - which is how a thread
   *      uploaded from Takeout as three separate messages is recognised here
   *      as the same conversation, instead of being read and paid for again.
   *   3. The thread's own key, for a plain repeat.
   *
   * A thread that has gained a reply since it was imported is updated rather
   * than skipped, and put back to 'new' so the model reads the fuller
   * conversation. That is the one case where re-reading is worth paying for.
   */
  async storeThread(
    thread: ReadThread,
    mailbox: string,
  ): Promise<{ stored: 'created' | 'updated' | 'duplicate'; emailId?: string }> {
    const supabase = getAdminScopedClient();

    const { data: existingThread } = await supabase
      .from('inbound_emails')
      .select('id, gmail_thread_id, message_ids, status')
      .eq('mailbox', mailbox)
      .eq('gmail_thread_id', thread.threadId)
      .maybeSingle();

    const row = {
      message_id: thread.messageId ?? `gmail-thread:${mailbox}:${thread.threadId}`,
      from_address: thread.fromAddress,
      from_name: thread.fromName ?? null,
      to_address: thread.toAddress ?? null,
      subject: thread.subject ?? null,
      sent_at: thread.sentAt ?? null,
      body_text: thread.bodyText,
      body_raw: thread.bodyRaw,
      asked_about_domain: thread.askedAboutDomain ?? null,
      source: 'gmail',
      mailbox,
      gmail_thread_id: thread.threadId,
      message_ids: thread.messageIds,
      attachments: thread.attachments,
      has_rate_card: thread.hasRateCard,
    };

    if (existingThread) {
      const known = new Set(((existingThread as { message_ids: string[] }).message_ids ?? []));
      const grown = thread.messageIds.some((id) => !known.has(id));
      if (!grown) return { stored: 'duplicate', emailId: String((existingThread as { id: string }).id) };

      // New replies since we last looked. Worth reading again.
      await supabase
        .from('inbound_emails')
        .update({ ...row, status: 'new', batch_id: null, status_reason: null, extracted_at: null })
        .eq('id', (existingThread as { id: string }).id);

      return { stored: 'updated', emailId: String((existingThread as { id: string }).id) };
    }

    // The same conversation may already be here one message at a time, from
    // an upload. Overlapping on any Message-ID is enough to say so.
    //
    // Two queries rather than one `.or()`: a Message-ID is arbitrary text
    // from a header, and building a PostgREST filter string out of it means
    // escaping commas, braces and quotes correctly every time. `in` and
    // `overlaps` take the values as values.
    if (thread.messageIds.length > 0) {
      const [keyed, within] = await Promise.all([
        supabase.from('inbound_emails').select('id').in('message_id', thread.messageIds).limit(1),
        supabase.from('inbound_emails').select('id').overlaps('message_ids', thread.messageIds).limit(1),
      ]);

      const hit = ((keyed.data ?? [])[0] ?? (within.data ?? [])[0]) as { id: string } | undefined;
      if (hit) {
        // Recorded against the thread so a later run recognises it without
        // asking Gmail again, but not re-read and not re-charged.
        await supabase
          .from('inbound_emails')
          .update({ mailbox, gmail_thread_id: thread.threadId, message_ids: thread.messageIds })
          .eq('id', hit.id);
        return { stored: 'duplicate', emailId: String(hit.id) };
      }
    }

    const { data: created, error } = await supabase
      .from('inbound_emails')
      .insert({ ...row, status: 'new' })
      .select('id')
      .single();

    if (error) {
      // A unique violation means another chunk stored it a moment ago, which
      // is a duplicate rather than a failure.
      if (error.code === '23505') return { stored: 'duplicate' };
      throw new Error(`Could not store the thread: ${error.message}`);
    }

    return { stored: 'created', emailId: String((created as { id: string }).id) };
  },

  /**
   * Clear the bodies of emails whose drafts have been dealt with.
   *
   * Off unless somebody switches it on. Deleting a body is irreversible and
   * the email is the only record of what a publisher actually agreed to - so
   * the default is to keep it, and turning this on is a decision taken
   * deliberately rather than one inherited from a default.
   *
   * Only emails whose drafts are all settled are touched, and only ones old
   * enough. The row itself stays: it is what stops the same mail being
   * imported and paid for again, which is a job the body is not needed for.
   */
  async purgeReviewedBodies(): Promise<{ purged: number; enabled: boolean }> {
    if (!isSupabaseEnabled()) return { purged: 0, enabled: false };

    const settings = await sourcingService.getSettings();
    if (!settings.purgeBodiesEnabled) return { purged: 0, enabled: false };

    const supabase = getAdminScopedClient();
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - settings.purgeBodiesAfterDays);

    // Anything still pending review keeps its body, however old it is: a
    // draft somebody has not looked at yet is exactly when the original is
    // needed.
    const { data: pending } = await supabase
      .from('listing_drafts')
      .select('email_id')
      .eq('status', 'pending');

    const waiting = new Set(((pending ?? []) as { email_id: string }[]).map((row) => row.email_id));

    const { data: candidates } = await supabase
      .from('inbound_emails')
      .select('id')
      .in('status', ['extracted', 'ignored'])
      .lt('extracted_at', cutoff.toISOString())
      .neq('body_text', '')
      .limit(500);

    const ids = ((candidates ?? []) as { id: string }[])
      .map((row) => row.id)
      .filter((id) => !waiting.has(id));

    if (ids.length === 0) return { purged: 0, enabled: true };

    await supabase
      .from('inbound_emails')
      .update({ body_text: '', body_raw: '', status_reason: 'Body cleared by the retention setting.' })
      .in('id', ids);

    return { purged: ids.length, enabled: true };
  },

  // ------------------------------------------------------- rate card leads

  /**
   * Replies that sent a rate card instead of a price.
   *
   * Ignored emails carrying an attachment or a link out. They produced no
   * draft and the reason was accurate - the prices are in a PDF or a Google
   * Sheet we never opened - but a publisher who sends a full rate card is the
   * opposite of a dead lead, and until now they landed in a list with no
   * actions on it.
   *
   * Dismissed ones are gone from here for good; that is what dismissing is.
   */
  async rateCardLeads(limit = 100): Promise<RateCardLead[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('inbound_emails')
      .select(
        'id, message_id, from_address, from_name, subject, sent_at, body_text, status_reason, asked_about_domain, source, mailbox, gmail_thread_id, attachments, has_rate_card',
      )
      .eq('status', 'ignored')
      .is('rate_card_dismissed_at', null)
      .order('sent_at', { ascending: false })
      .limit(limit * 3);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];

    return rows
      .map((row) => ({
        id: String(row.id),
        fromAddress: String(row.from_address ?? ''),
        fromName: (row.from_name as string | null) ?? null,
        subject: (row.subject as string | null) ?? null,
        sentAt: (row.sent_at as string | null) ?? null,
        askedAboutDomain: (row.asked_about_domain as string | null) ?? null,
        reason: (row.status_reason as string | null) ?? null,
        attachments: (row.attachments as RateCardLead['attachments']) ?? [],
        hasRateCard: Boolean(row.has_rate_card),
        links: extractLinks(String(row.body_text ?? '')),
        gmailUrl:
          row.mailbox && row.gmail_thread_id
            ? gmailThreadUrl(String(row.mailbox), String(row.gmail_thread_id))
            : null,
        findUrl: gmailSearchUrl(String(row.message_id ?? ''), row.mailbox as string | null),
      }))
      // The filter is applied after mapping because "has a link" is only
      // knowable once the body has been read for links, and doing that in the
      // query would mean storing them - a second copy that can go stale.
      .filter((lead) => lead.hasRateCard || lead.attachments.length > 0 || lead.links.length > 0)
      .slice(0, limit);
  },

  /**
   * Put the rate card's contents into the email and queue it to be read.
   *
   * The whole point of the worklist. Somebody opens the sheet, copies the
   * rates, pastes them here - and from that moment it is an ordinary email
   * waiting to be read, with no new extraction path and no new rules.
   *
   * The pasted text is marked in the body. When a listing is argued about
   * later, "the model read this from their reply" and "a person typed this
   * after reading their spreadsheet" are different claims, and the body is
   * where anybody will look to tell them apart.
   */
  async addRateCard(
    emailId: string,
    text: string,
    by?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const contents = text.trim();
    if (contents.length < 10) {
      return { ok: false, message: 'Paste the rates from the rate card first.' };
    }

    const supabase = getAdminScopedClient();
    const { data: existing } = await supabase
      .from('inbound_emails')
      .select('id, body_text, body_raw')
      .eq('id', emailId)
      .maybeSingle();

    if (!existing) return { ok: false, message: 'That email no longer exists.' };
    const row = existing as { body_text: string; body_raw: string };

    const stamp = new Date().toISOString().slice(0, 10);
    const marked = `\n\n--- Rate card contents, added by ${by ?? 'an admin'} on ${stamp} ---\n${contents}`;

    const { error } = await supabase
      .from('inbound_emails')
      .update({
        body_text: `${row.body_text ?? ''}${marked}`,
        body_raw: `${row.body_raw ?? ''}${marked}`,
        // Back in the queue, exactly as if it had just arrived.
        status: 'new',
        status_reason: null,
        batch_id: null,
        extracted_at: null,
        rate_card_added_at: new Date().toISOString(),
        rate_card_added_by: by ?? null,
      })
      .eq('id', emailId);

    if (error) return { ok: false, message: 'That could not be saved.' };
    return { ok: true, message: 'Added. Press Read on the publisher inbox to extract it.' };
  },

  /** Not a rate card after all. It drops off the worklist for good. */
  async dismissRateCard(emailId: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('inbound_emails')
      .update({ rate_card_dismissed_at: new Date().toISOString() })
      .eq('id', emailId);
  },

  // ------------------------------------------------------------ extraction

  /**
   * Emails waiting to be read. Only these ever cost anything.
   *
   * Claimed rows are excluded because this number is what the button offers to
   * send, and `nextBatch` will not send a claimed row. Counting them said
   * "read 50 waiting" when pressing it would read 25.
   */
  async pendingCount(): Promise<number> {
    const supabase = getAdminScopedClient();
    const { count } = await supabase
      .from('inbound_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('batch_id', null);
    return count ?? 0;
  },

  /** What has been spent this calendar month, from reported tokens only. */
  async spentThisMonthUsd(): Promise<number> {
    const supabase = getAdminScopedClient();
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('extraction_batches')
      .select('model, mode, input_tokens, output_tokens')
      .gte('created_at', since.toISOString());

    return ((data ?? []) as Record<string, unknown>[]).reduce((total, row) => {
      const usage = {
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
      };
      return total + estimateCostUsd(String(row.model), usage, row.mode === 'batch' ? 'batch' : 'realtime');
    }, 0);
  },

  /**
   * Read the waiting emails.
   *
   * Refuses rather than spends when the switch is off, the key is missing, or
   * the month's budget is already gone. `dryRun` walks the whole path -
   * settings, budget, the emails it would send - and stops before the call,
   * so the wiring can be checked for nothing.
   */
  async runExtraction(options: {
    limit?: number;
    dryRun?: boolean;
    submittedBy?: string;
  } = {}): Promise<{
    ok: boolean;
    message: string;
    batchId?: string;
    extracted?: number;
    failed?: number;
    draftsCreated?: number;
    wouldSend?: number;
  }> {
    const settings = await sourcingService.getSettings();
    const limit = options.limit ?? EXTRACTION_BATCH_LIMIT;

    if (!settings.enabled) {
      return { ok: false, message: 'Extraction is switched off. Turn it on in the settings above.' };
    }
    if (!settings.configured) {
      return {
        ok: false,
        message: 'ANTHROPIC_API_KEY is not set on this deployment. Add it in Vercel and redeploy.',
      };
    }

    const spent = await sourcingService.spentThisMonthUsd();
    if (spent >= settings.monthlyBudgetUsd) {
      return {
        ok: false,
        message: `This month's extraction budget is spent (${spent.toFixed(2)} of ${settings.monthlyBudgetUsd.toFixed(2)} USD). Raise it in the settings to continue.`,
      };
    }

    const supabase = getAdminScopedClient();
    /*
      Unread AND unclaimed.

      The claim below sets `batch_id`, and this query used to ignore it: an
      email sitting in a running batch is still 'new', so pressing the button
      a second time selected the same oldest twenty-five and sent them to the
      model again - a second charge and a second set of drafts for work
      already in flight. The claim was written; nothing read it.

      There is no 'processing' status to move them to - the column's check
      constraint allows four values and adding a fifth would need a migration
      for something `batch_id` already records.
    */
    const { data: rows } = await supabase
      .from('inbound_emails')
      .select('id, from_address, subject, body_text, asked_about_domain')
      .eq('status', 'new')
      .is('batch_id', null)
      .order('sent_at', { ascending: true })
      .limit(limit);

    const emails = (rows ?? []) as Record<string, unknown>[];
    if (emails.length === 0) {
      return { ok: true, message: 'Nothing waiting. Every stored email has been read already.' };
    }

    const requests: ExtractionRequest[] = emails.map((row) => ({
      emailId: String(row.id),
      askedAboutDomain: (row.asked_about_domain as string | null) ?? null,
      fromAddress: String(row.from_address ?? ''),
      subject: (row.subject as string | null) ?? null,
      body: String(row.body_text ?? ''),
    }));

    if (options.dryRun) {
      return {
        ok: true,
        wouldSend: requests.length,
        message: `Dry run: ${requests.length} ${requests.length === 1 ? 'email' : 'emails'} would be sent to ${settings.model} in ${settings.mode} mode. Nothing was sent and nothing was charged.`,
      };
    }

    const { data: batch } = await supabase
      .from('extraction_batches')
      .insert({
        mode: settings.mode,
        model: settings.model,
        prompt_version: PROMPT_VERSION,
        status: settings.mode === 'batch' ? 'submitted' : 'running',
        email_count: requests.length,
        submitted_by: options.submittedBy ?? null,
      })
      .select('id')
      .single();

    const batchId = String((batch as { id: string }).id);

    /*
      Claim before sending, and send only what the claim actually won.

      The update is conditional on the row still being unclaimed and returns
      the rows it changed, so two clicks a second apart cannot both send the
      same email: the first takes them, the second's update matches nothing
      and it submits nothing. Selecting and then updating without the
      condition leaves a gap between the two where both callers believe they
      have the same twenty-five.
    */
    const { data: claimedRows } = await supabase
      .from('inbound_emails')
      .update({ batch_id: batchId })
      .in('id', requests.map((request) => request.emailId))
      .is('batch_id', null)
      .select('id');

    const claimed = new Set(((claimedRows ?? []) as { id: string }[]).map((row) => row.id));
    const toSend = requests.filter((request) => claimed.has(request.emailId));

    if (toSend.length === 0) {
      await supabase.from('extraction_batches').delete().eq('id', batchId);
      return {
        ok: true,
        message: 'Those emails are already being read. Collect the running batch instead.',
      };
    }

    if (toSend.length !== requests.length) {
      await supabase
        .from('extraction_batches')
        .update({ email_count: toSend.length })
        .eq('id', batchId);
    }

    if (settings.mode === 'batch') {
      try {
        const providerBatchId = await submitBatch(toSend, settings.model);
        await supabase
          .from('extraction_batches')
          .update({ provider_batch_id: providerBatchId, status: 'running' })
          .eq('id', batchId);
        return {
          ok: true,
          batchId,
          message: `Submitted ${toSend.length} ${toSend.length === 1 ? 'email' : 'emails'} to the Batch API at half price. Results usually arrive within the hour; collect them from this page.`,
        };
      } catch (error) {
        await sourcingService.failBatch(batchId, error);
        return { ok: false, message: `Could not submit the batch: ${describe(error)}` };
      }
    }

    const outcomes: ExtractionOutcome[] = [];
    for (const request of toSend) {
      outcomes.push(await extractNow(request, settings.model));
    }

    const applied = await sourcingService.applyOutcomes(batchId, outcomes, settings.model);

    // The reason goes in the message that appears the moment the run ends.
    // A bare "read 0 of 1" sends somebody to the database to find out why,
    // which is exactly the trip this line exists to save.
    const summary =
      applied.failed > 0 && applied.firstError
        ? `Read ${applied.extracted} of ${toSend.length}. ${applied.failed} failed: ${applied.firstError}`
        : `Read ${applied.extracted} of ${toSend.length}. ${applied.draftsCreated} ${applied.draftsCreated === 1 ? 'draft' : 'drafts'} are waiting for review.`;

    return { ok: applied.failed === 0, batchId, ...applied, message: summary };
  },

  /** Poll every running batch and collect the ones that have finished. */
  async collectBatches(): Promise<{ collected: number; draftsCreated: number; message: string }> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('extraction_batches')
      .select('id, provider_batch_id, model, created_at, status')
      .eq('mode', 'batch')
      .in('status', ['submitted', 'running']);

    const running = (data ?? []) as {
      id: string;
      provider_batch_id: string | null;
      model: string;
      created_at: string;
      status: string;
    }[];
    let collected = 0;
    let draftsCreated = 0;
    let stillRunning = 0;
    let released = 0;

    for (const batch of running) {
      const age = minutesSince(batch.created_at);

      /*
        A batch with no provider id was never handed over.

        The emails are claimed before the submission so two clicks cannot send
        the same one twice; if the process dies in between, the claim stands
        and there is nothing to collect. This used to `continue`, which left
        those emails claimed for ever - counted as "being read" by a batch
        that did not exist, with nothing in the system able to notice.
      */
      if (!batch.provider_batch_id) {
        if (age >= NEVER_SUBMITTED_AFTER_MINUTES) {
          await sourcingService.failBatch(batch.id, new Error('Never reached the API. The emails were put back.'));
          released += 1;
        } else {
          stillRunning += 1;
        }
        continue;
      }

      // Past Anthropic's own ceiling, results are not coming.
      if (age >= ABANDON_AFTER_MINUTES) {
        await sourcingService.failBatch(batch.id, new Error('No results after 24 hours. The emails were put back.'));
        released += 1;
        continue;
      }

      try {
        const state = await checkBatch(batch.provider_batch_id);
        if (state === 'running') {
          stillRunning += 1;
          continue;
        }
        if (state !== 'completed') {
          await supabase
            .from('extraction_batches')
            .update({ status: state, completed_at: new Date().toISOString() })
            .eq('id', batch.id);
          continue;
        }

        const outcomes = await collectBatch(batch.provider_batch_id);
        const applied = await sourcingService.applyOutcomes(batch.id, outcomes, batch.model);
        collected += 1;
        draftsCreated += applied.draftsCreated;
      } catch (error) {
        await sourcingService.failBatch(batch.id, error);
      }
    }

    if (running.length === 0) return { collected: 0, draftsCreated: 0, message: 'No batches are running.' };

    const put = released > 0
      ? ` ${released} ${released === 1 ? 'batch was' : 'batches were'} stuck; those emails are back in the queue.`
      : '';

    if (collected === 0) {
      return {
        collected: 0,
        draftsCreated: 0,
        message: stillRunning > 0
          ? `${stillRunning} ${stillRunning === 1 ? 'batch is' : 'batches are'} still running. Check again shortly.${put}`
          : put.trim() || 'Nothing to collect.',
      };
    }
    return {
      collected,
      draftsCreated,
      message: `Collected ${collected} ${collected === 1 ? 'batch' : 'batches'}. ${draftsCreated} ${draftsCreated === 1 ? 'draft is' : 'drafts are'} waiting for review.${put}`,
    };
  },

  /**
   * Give up on everything outstanding and put the emails back.
   *
   * The escape hatch for a run that is not coming back, pressed by a human
   * who has decided waiting is over. Nothing is lost: the emails return to
   * 'new' exactly as they arrived, and reading them again costs what reading
   * them cost the first time - which is nothing, since the first attempt
   * produced no result to pay for.
   */
  async releaseStuckBatches(): Promise<{ batches: number; emails: number; message: string }> {
    const supabase = getAdminScopedClient();

    /*
      Real-time runs count too.

      A real-time batch is only ever 'running' while the request that owns it
      is alive. If that request was killed - and eleven sequential calls to
      the model will kill it - the row stays 'running' for ever and its
      emails stay claimed. Filtering on mode 'batch' here meant the one way
      out did not cover the way in that strands them fastest.
    */
    const { data } = await supabase
      .from('extraction_batches')
      .select('id, email_count')
      .in('status', ['submitted', 'running']);

    const stuck = (data ?? []) as { id: string; email_count: number }[];
    if (stuck.length === 0) {
      return { batches: 0, emails: 0, message: 'Nothing is outstanding.' };
    }

    let emails = 0;
    for (const batch of stuck) {
      // Count what was actually released rather than what the batch claimed:
      // some of its emails may have been collected already.
      const { data: freed } = await supabase
        .from('inbound_emails')
        .update({ batch_id: null })
        .eq('batch_id', batch.id)
        .eq('status', 'new')
        .select('id');

      emails += (freed ?? []).length;

      await supabase
        .from('extraction_batches')
        .update({
          status: 'failed',
          status_reason: 'Given up on by an admin. The emails were put back in the queue.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', batch.id);
    }

    return {
      batches: stuck.length,
      emails,
      message: `${emails} ${emails === 1 ? 'email is' : 'emails are'} back in the queue. Press Read to send them again.`,
    };
  },

  async failBatch(batchId: string, error: unknown): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('extraction_batches')
      .update({
        status: 'failed',
        status_reason: describe(error),
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);
    // Released rather than stranded: these emails are still unread, and a
    // batch that failed must not leave them permanently claimed.
    await supabase
      .from('inbound_emails')
      .update({ batch_id: null })
      .eq('batch_id', batchId)
      .eq('status', 'new');
  },

  /**
   * Turn model output into drafts.
   *
   * Shared by both modes, so a batch result and a real-time result become the
   * same rows by the same rules.
   */
  async applyOutcomes(
    batchId: string,
    outcomes: ExtractionOutcome[],
    model: string,
  ): Promise<{ extracted: number; failed: number; draftsCreated: number; firstError?: string }> {
    const supabase = getAdminScopedClient();
    let extracted = 0;
    let failed = 0;
    let draftsCreated = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let firstError: string | undefined;

    for (const outcome of outcomes) {
      inputTokens += outcome.usage?.inputTokens ?? 0;
      outputTokens += outcome.usage?.outputTokens ?? 0;

      if (outcome.error || !outcome.result) {
        failed += 1;
        firstError ??= outcome.error;
        await supabase
          .from('inbound_emails')
          .update({ status: 'failed', status_reason: outcome.error ?? 'No result.' })
          .eq('id', outcome.emailId);
        continue;
      }

      const result = outcome.result;

      // Nothing usable: recorded as ignored with the reason, rather than as a
      // draft with every field empty for a human to work out and reject.
      if (!result.usable || result.listings.length === 0) {
        extracted += 1;
        await supabase
          .from('inbound_emails')
          .update({
            status: 'ignored',
            status_reason: result.ignore_reason ?? 'No usable pricing in this email.',
            extracted_at: new Date().toISOString(),
          })
          .eq('id', outcome.emailId);
        continue;
      }

      // One row per domain the reply covers, network included.
      const expanded = expandListings(result.listings);

      // All the matches in one query rather than one per domain: a reply
      // covering sixty portals would otherwise be sixty round trips.
      const { data: matches } = await supabase
        .from('websites')
        .select('id, domain')
        .in('domain', expanded.map((entry) => entry.domain));
      const matchByDomain = new Map(
        ((matches ?? []) as { id: string; domain: string }[]).map((row) => [row.domain, row.id]),
      );

      const drafts = expanded.map((entry) => ({
        email_id: outcome.emailId,
        domain: entry.domain,
        matched_website_id: matchByDomain.get(entry.domain) ?? null,
        proposed: entry.listing as unknown as Record<string, unknown>,
        // Stored as maps keyed by field, which is what the review screen
        // reads. The array shape exists only because the model's schema
        // cannot express an open map.
        confidence: asMap(entry.listing.confidence, (item) => item.level),
        evidence: asMap(entry.listing.evidence, (item) => item.quote),
        low_confidence_count: countLowConfidence(entry.listing),
        flags: entry.inheritedFrom
          ? [...flagsFor(entry.listing), 'terms-from-network']
          : flagsFor(entry.listing),
        status: 'pending',
        extraction_model: model,
        prompt_version: PROMPT_VERSION,
      }));

      if (drafts.length > 0) {
        // Re-extracting replaces rather than doubles.
        const { error } = await supabase
          .from('listing_drafts')
          .upsert(drafts, { onConflict: 'email_id,domain' });
        if (!error) draftsCreated += drafts.length;
      }

      extracted += 1;
      await supabase
        .from('inbound_emails')
        .update({ status: 'extracted', status_reason: null, extracted_at: new Date().toISOString() })
        .eq('id', outcome.emailId);
    }

    await supabase
      .from('extraction_batches')
      .update({
        status: 'completed',
        succeeded_count: extracted,
        failed_count: failed,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    return { extracted, failed, draftsCreated, firstError };
  },
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : 'Unknown error.';
}
