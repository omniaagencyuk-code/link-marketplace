import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { readMbox, readPastedEmail, type ParsedMessage } from '@/lib/sourcing/mbox';
import { gmailSearchUrl, gmailThreadUrl, type ReadThread } from '@/lib/gmail/thread';
import { extractLinks, type FoundLink } from '@/lib/sourcing/links';
import { rankOffers, type Offer, type RankedOffer } from '@/lib/sourcing/offers';
import { fxService } from './fx-service';
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
import { extractionLimit } from '@/lib/sourcing/limits';

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
  /** Importing nightly is free. Reading what it finds is not. */
  nightlyImportEnabled: boolean;
  nightlyImportQuery: string;
  nightlyImportCap: number;
  nightlyImportReads: boolean;
  nightlyImportLastRunAt: string | null;
  nightlyImportLastResult: string | null;
}

export interface NoDraftEmail {
  id: string;
  /** Who replied. Often not the address we wrote to. */
  fromAddress: string;
  fromName: string | null;
  /** The mailbox of ours the reply came into, so you know where to look. */
  mailbox: string | null;
  /** The address our outreach went to, where the headers recorded one. */
  toAddress: string | null;
  subject: string | null;
  sentAt: string | null;
  askedAboutDomain: string | null;
  /** Why extraction produced no draft, in the model's own words. */
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
  nightlyImportEnabled: false,
  nightlyImportQuery: '-from:me newer_than:14d (price OR rates OR "guest post" OR sponsored OR advertising)',
  nightlyImportCap: 200,
  nightlyImportReads: false,
  nightlyImportLastRunAt: null,
  nightlyImportLastResult: null,
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
      nightlyImportEnabled: Boolean(data.nightly_import_enabled),
      nightlyImportQuery: (data.nightly_import_query as string) ?? DEFAULTS.nightlyImportQuery,
      nightlyImportCap: Number(data.nightly_import_cap ?? DEFAULTS.nightlyImportCap),
      nightlyImportReads: Boolean(data.nightly_import_reads),
      nightlyImportLastRunAt: (data.nightly_import_last_run_at as string | null) ?? null,
      nightlyImportLastResult: (data.nightly_import_last_result as string | null) ?? null,
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
        ...(patch.nightlyImportEnabled === undefined
          ? {}
          : { nightly_import_enabled: patch.nightlyImportEnabled }),
        ...(patch.nightlyImportQuery === undefined
          ? {}
          : { nightly_import_query: patch.nightlyImportQuery }),
        ...(patch.nightlyImportCap === undefined
          ? {}
          : { nightly_import_cap: patch.nightlyImportCap }),
        ...(patch.nightlyImportReads === undefined
          ? {}
          : { nightly_import_reads: patch.nightlyImportReads }),
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

      // New replies since we last looked. Worth reading again - and worth
      // saying so on the draft, because an approved draft reverting to
      // pending looks exactly like work somebody has already done.
      await supabase
        .from('inbound_emails')
        .update({
          ...row,
          status: 'new',
          batch_id: null,
          status_reason: null,
          extracted_at: null,
          reply_since_last_read: true,
        })
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

  /**
   * Everyone else offering this domain.
   *
   * Drafts already hold every offer with its sender, price and currency,
   * whatever became of them - so a rejected offer is still a contact and a
   * price, and the one that lost is exactly the one worth having when the
   * winner stops replying. Nothing new is stored; this reads what is there.
   */
  async competingOffers(domain: string, exceptDraftId: string): Promise<RankedOffer[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('listing_drafts')
      .select('id, domain, status, proposed, inbound_emails (from_address, sent_at)')
      .eq('domain', domain)
      .neq('id', exceptDraftId)
      .limit(20);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];

    const offers: Offer[] = rows.map((row) => {
      const email = Array.isArray(row.inbound_emails) ? row.inbound_emails[0] : row.inbound_emails;
      const proposed = (row.proposed ?? {}) as Record<string, unknown>;
      return {
        draftId: String(row.id),
        domain: String(row.domain),
        fromAddress: String(email?.from_address ?? ''),
        cost: typeof proposed.guest_post_cost === 'number' ? proposed.guest_post_cost : null,
        currency: typeof proposed.currency === 'string' ? proposed.currency : null,
        sentAt: (email?.sent_at as string | null) ?? null,
        status: String(row.status),
      };
    });

    return rankOffers(offers, await fxService.rateMap());
  },

  /**
   * Domains that more than one reply offers.
   *
   * Computed rather than stored on the draft, because the second offer
   * usually arrives after the first was read - a flag written at extraction
   * would be right about the newer draft and wrong about the older one.
   */
  async domainsWithCompetingOffers(): Promise<Set<string>> {
    if (!isSupabaseEnabled()) return new Set();
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('listing_drafts')
      .select('domain')
      .in('status', ['pending', 'approved'])
      .limit(5000);

    const seen = new Map<string, number>();
    for (const row of (data ?? []) as { domain: string }[]) {
      seen.set(row.domain, (seen.get(row.domain) ?? 0) + 1);
    }

    return new Set([...seen].filter(([, count]) => count > 1).map(([domain]) => domain));
  },

  // --------------------------------------------------------- no-draft work

  /**
   * Every reply that produced no draft, as a list somebody can work through.
   *
   * Extraction marks an email 'ignored' when it finds nothing usable, and the
   * reason is almost always accurate - the prices are in a PDF, or the reply
   * is prose we could not read, or nobody could tell which site it was about.
   * Accurate is not the same as finished: a publisher who answered at all is
   * worth a minute of somebody's time, and until now these landed in a grey
   * box with no actions on it.
   *
   * Replies carrying a rate card come first, because those are the ones with
   * a price on the other end of a link. Handled and dismissed rows are gone:
   * that is what those two words mean.
   */
  async noDraftEmails(limit = 200): Promise<NoDraftEmail[]> {
    if (!isSupabaseEnabled()) return [];
    const supabase = getAdminScopedClient();

    const { data } = await supabase
      .from('inbound_emails')
      .select(
        'id, message_id, from_address, from_name, to_address, subject, sent_at, body_text, status_reason, asked_about_domain, source, mailbox, gmail_thread_id, attachments, has_rate_card',
      )
      .eq('status', 'ignored')
      .is('no_draft_dismissed_at', null)
      .is('no_draft_handled_at', null)
      .order('sent_at', { ascending: false })
      .limit(limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []) as any[];

    const emails: NoDraftEmail[] = rows.map((row) => {
      const attachments = (row.attachments as NoDraftEmail['attachments']) ?? [];
      const links = extractLinks(String(row.body_text ?? ''));
      return {
        id: String(row.id),
        fromAddress: String(row.from_address ?? ''),
        fromName: (row.from_name as string | null) ?? null,
        mailbox: (row.mailbox as string | null) ?? null,
        toAddress: (row.to_address as string | null) ?? null,
        subject: (row.subject as string | null) ?? null,
        sentAt: (row.sent_at as string | null) ?? null,
        askedAboutDomain: (row.asked_about_domain as string | null) ?? null,
        reason: (row.status_reason as string | null) ?? null,
        attachments,
        hasRateCard: Boolean(row.has_rate_card) || attachments.length > 0 || links.length > 0,
        links,
        gmailUrl:
          row.mailbox && row.gmail_thread_id
            ? gmailThreadUrl(String(row.mailbox), String(row.gmail_thread_id))
            : null,
        findUrl: gmailSearchUrl(String(row.message_id ?? ''), row.mailbox as string | null),
      };
    });

    // A rate card is a price behind a link. Everything else needs reading.
    return emails.sort((a, b) => Number(b.hasRateCard) - Number(a.hasRateCard));
  },

  /**
   * Put the rate card's contents into the email and queue it to be read.
   *
   * Somebody opens the sheet, copies the rates, pastes them here - and from
   * that moment it is an ordinary email waiting to be read, with no new
   * extraction path and no new rules.
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

  /**
   * Dealt with by hand: the listing was added from this reply.
   *
   * Recorded rather than deleted. A listing that exists because somebody read
   * an email and typed it in is a different kind of fact from one the model
   * extracted, and six months from now the only place that will be written
   * down is here.
   */
  async markNoDraftHandled(emailId: string, by?: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('inbound_emails')
      .update({ no_draft_handled_at: new Date().toISOString(), no_draft_handled_by: by ?? null })
      .eq('id', emailId);
  },

  /** Nothing worth having. It leaves the list and does not come back. */
  async dismissNoDraft(emailId: string): Promise<void> {
    const supabase = getAdminScopedClient();
    await supabase
      .from('inbound_emails')
      .update({ no_draft_dismissed_at: new Date().toISOString() })
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
    const limit = options.limit ?? extractionLimit(settings.mode);

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

      /*
        Did this reading follow a new reply?

        Read now rather than passed down from the import: the two happen in
        different requests, and the only thing that connects them is the row.
      */
      const { data: emailRow } = await supabase
        .from('inbound_emails')
        .select('reply_since_last_read')
        .eq('id', outcome.emailId)
        .maybeSingle();

      const repliedAgain = Boolean((emailRow as { reply_since_last_read?: boolean } | null)?.reply_since_last_read);

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
        flags: [
          ...flagsFor(entry.listing),
          ...(entry.inheritedFrom ? ['terms-from-network'] : []),
          ...(repliedAgain ? ['replied-again'] : []),
        ],
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
        .update({
          status: 'extracted',
          status_reason: null,
          extracted_at: new Date().toISOString(),
          // Cleared here so the flag marks the one reading that followed the
          // new reply, rather than every reading from now on.
          reply_since_last_read: false,
        })
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
