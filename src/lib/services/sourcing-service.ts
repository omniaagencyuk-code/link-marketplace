import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { normaliseDomain } from '@/lib/import/normalise';
import { readMbox, readPastedEmail, type ParsedMessage } from '@/lib/sourcing/mbox';
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
import { countLowConfidence, flagsFor } from '@/lib/sourcing/review';

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

  // ------------------------------------------------------------ extraction

  /** Emails waiting to be read. Only these ever cost anything. */
  async pendingCount(): Promise<number> {
    const supabase = getAdminScopedClient();
    const { count } = await supabase
      .from('inbound_emails')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new');
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
    const limit = options.limit ?? 25;

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
    const { data: rows } = await supabase
      .from('inbound_emails')
      .select('id, from_address, subject, body_text, asked_about_domain')
      .eq('status', 'new')
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

    // Claimed before the call. An email in flight is not 'new', so a second
    // click cannot send the same email to the model twice.
    await supabase
      .from('inbound_emails')
      .update({ batch_id: batchId })
      .in('id', requests.map((request) => request.emailId));

    if (settings.mode === 'batch') {
      try {
        const providerBatchId = await submitBatch(requests, settings.model);
        await supabase
          .from('extraction_batches')
          .update({ provider_batch_id: providerBatchId, status: 'running' })
          .eq('id', batchId);
        return {
          ok: true,
          batchId,
          message: `Submitted ${requests.length} ${requests.length === 1 ? 'email' : 'emails'} to the Batch API at half price. Results usually arrive within the hour; collect them from this page.`,
        };
      } catch (error) {
        await sourcingService.failBatch(batchId, error);
        return { ok: false, message: `Could not submit the batch: ${describe(error)}` };
      }
    }

    const outcomes: ExtractionOutcome[] = [];
    for (const request of requests) {
      outcomes.push(await extractNow(request, settings.model));
    }

    const applied = await sourcingService.applyOutcomes(batchId, outcomes, settings.model);
    return {
      ok: true,
      batchId,
      ...applied,
      message: `Read ${applied.extracted} of ${requests.length}. ${applied.draftsCreated} ${applied.draftsCreated === 1 ? 'draft' : 'drafts'} are waiting for review.`,
    };
  },

  /** Poll every running batch and collect the ones that have finished. */
  async collectBatches(): Promise<{ collected: number; draftsCreated: number; message: string }> {
    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('extraction_batches')
      .select('id, provider_batch_id, model')
      .eq('mode', 'batch')
      .in('status', ['submitted', 'running']);

    const running = (data ?? []) as { id: string; provider_batch_id: string | null; model: string }[];
    let collected = 0;
    let draftsCreated = 0;
    let stillRunning = 0;

    for (const batch of running) {
      if (!batch.provider_batch_id) continue;
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
    if (collected === 0) {
      return {
        collected: 0,
        draftsCreated: 0,
        message: `${stillRunning} ${stillRunning === 1 ? 'batch is' : 'batches are'} still running. Check again shortly.`,
      };
    }
    return {
      collected,
      draftsCreated,
      message: `Collected ${collected} ${collected === 1 ? 'batch' : 'batches'}. ${draftsCreated} ${draftsCreated === 1 ? 'draft is' : 'drafts are'} waiting for review.`,
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
  ): Promise<{ extracted: number; failed: number; draftsCreated: number }> {
    const supabase = getAdminScopedClient();
    let extracted = 0;
    let failed = 0;
    let draftsCreated = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    for (const outcome of outcomes) {
      inputTokens += outcome.usage?.inputTokens ?? 0;
      outputTokens += outcome.usage?.outputTokens ?? 0;

      if (outcome.error || !outcome.result) {
        failed += 1;
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

      const drafts = [];
      for (const listing of result.listings) {
        const domain = normaliseDomain(listing.domain);
        if (!domain) continue;

        const { data: match } = await supabase
          .from('websites')
          .select('id')
          .eq('domain', domain)
          .maybeSingle();

        drafts.push({
          email_id: outcome.emailId,
          domain,
          matched_website_id: match ? (match as { id: string }).id : null,
          values: listing as unknown as Record<string, unknown>,
          confidence: listing.confidence,
          evidence: listing.evidence,
          low_confidence_count: countLowConfidence(listing),
          flags: flagsFor(listing),
          status: 'pending',
          extraction_model: model,
          prompt_version: PROMPT_VERSION,
        });
      }

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

    return { extracted, failed, draftsCreated };
  },
};

function describe(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 400) : 'Unknown error.';
}
