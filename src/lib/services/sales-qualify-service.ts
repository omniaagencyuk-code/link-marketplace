import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { estimateCostUsd, getClient, isExtractionConfigured, messageFor } from '@/lib/sourcing/client';
import {
  QUALIFICATION_PROMPT_VERSION,
  QUALIFICATION_RULES,
  buildQualificationMessage,
} from '@/lib/sales/qualification-rules';
import {
  fromWire,
  quoteIsReal,
  wireQualificationSchema,
  type ParsedQualification,
} from '@/lib/sales/qualification-schema';
import { scoreProspect } from '@/lib/sales/scoring';
import { prospectService } from './prospect-service';
import { salesRunService } from './sales-run-service';
import { salesSettingsService } from './sales-settings-service';
import type { SalesSegment } from '@/lib/types/sales';

/**
 * Asking a model whether a company buys backlinks.
 *
 * The rules are in `sales/qualification-rules.ts` and that file is the prompt.
 * Every qualification records the model and the prompt version it was made
 * under, so a rule that turns out to be wrong leaves a findable trail of the
 * judgements made under it - the same bookkeeping `listing_drafts` keeps.
 *
 * ## Nothing here decides anything
 *
 * A qualification is a row. It moves a prospect to `qualified` or
 * `disqualified` and it sets a score, and that is as far as it goes: no email
 * is written and nothing is sent. A person still decides who gets contacted,
 * for the reason `draft-approval.ts` exists.
 *
 * ## The quote check
 *
 * The prompt asks for words copied exactly from the pages the model was shown.
 * Asking is not checking. Every quote is verified against the text that was
 * actually sent, and one that is not in it is dropped - because a composed
 * quote is worse than no quote: it reads like evidence, and the score counts
 * quotes.
 */

/** Model spend is measured from reported tokens, never estimated beforehand. */
export interface QualifyOutcome {
  ok: boolean;
  verdict?: ParsedQualification['verdict'];
  error?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Quotes the model produced that were not in the source. Zero is normal. */
  quotesDropped?: number;
}

/** One slice's worth. Small; the time budget decides. */
const CHUNK = 8;
const DEFAULT_BUDGET_MS = 240_000;

/** Room for the answer. A qualification is a handful of short objects. */
const MAX_TOKENS = 8_000;

export async function qualifyProspect(
  prospectId: string,
  options: { model?: string; actor?: string } = {},
): Promise<QualifyOutcome> {
  if (!isSupabaseEnabled()) return { ok: false, error: 'No database' };
  if (!isExtractionConfigured()) {
    return { ok: false, error: 'ANTHROPIC_API_KEY is not set. Add it in Vercel and redeploy.' };
  }

  const settings = await salesSettingsService.get();
  if (!settings) return { ok: false, error: 'No sales settings' };
  if (!settings.enabled) {
    return { ok: false, error: 'The Sales Centre is off. Turn it on in Sales settings first.' };
  }

  /*
    The budget, checked before the call rather than after it.

    Measured from what the API reported on previous calls, summed in
    `sales_ai_spend_this_month`. A ceiling that is only noticed afterwards is
    not a ceiling.
  */
  const spend = await salesSettingsService.spend();
  if (spend && spend.aiBudgetUsd > 0 && spend.aiSpendUsd >= spend.aiBudgetUsd) {
    return {
      ok: false,
      error:
        `The model budget for this month is spent: $${spend.aiSpendUsd.toFixed(2)} of ` +
        `$${spend.aiBudgetUsd.toFixed(2)}. Raise it in Sales settings, or wait for the month to turn.`,
    };
  }

  const prospect = await prospectService.getById(prospectId);
  if (!prospect) return { ok: false, error: 'No such prospect' };

  const pages = await prospectService.pages(prospectId);
  const usable = pages.filter((page) => !page.error && page.textExcerpt.length > 0);

  if (usable.length === 0) {
    return { ok: false, error: 'Nothing has been read from their site yet. Research them first.' };
  }

  const model = options.model ?? settings.model;
  const sourceText = usable.map((page) => page.textExcerpt).join('\n\n');

  const message = buildQualificationMessage({
    companyName: prospect.companyName,
    domain: prospect.domain,
    signals: prospect.signals,
    pages: usable.map((page) => ({
      url: page.url,
      kind: page.kind,
      title: page.title,
      text: page.textExcerpt,
    })),
  });

  let parsed: ParsedQualification;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    /*
      Rules in `system` with a cache breakpoint, the company in the user turn,
      in that order and never the other way round: the rules are a couple of
      thousand identical tokens on every call, so cached they cost a tenth, and
      anything volatile ahead of them throws the cache away on every prospect.
    */
    const response = await getClient().messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text' as const,
          text: QUALIFICATION_RULES,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [{ role: 'user' as const, content: message }],
      output_config: { format: zodOutputFormat(wireQualificationSchema) },
    });

    inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
    outputTokens = response.usage.output_tokens;

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    const json = JSON.parse(text) as unknown;
    const checked = wireQualificationSchema.safeParse(json);
    if (!checked.success) {
      return {
        ok: false,
        error: `The model's answer did not match the schema: ${checked.error.issues
          .slice(0, 2)
          .map((issue) => `${issue.path.join('.') || 'the result'} ${issue.message}`)
          .join('; ')}`,
        inputTokens,
        outputTokens,
      };
    }

    parsed = fromWire(checked.data);
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }

  /*
    Every quote, checked against what was sent.

    A quote that is not in the source was composed, not copied. It is dropped
    rather than corrected: there is no way to repair a claim whose evidence
    was invented, and the score counts quotes, so letting one through inflates
    the score of the prospect the model was least sure about.
  */
  const before = parsed.reasons.length + parsed.buyingSignals.length;
  parsed = {
    ...parsed,
    reasons: parsed.reasons.filter((reason) => quoteIsReal(reason.quote, sourceText)),
    buyingSignals: parsed.buyingSignals.filter((reason) => quoteIsReal(reason.quote, sourceText)),
  };
  const quotesDropped = before - (parsed.reasons.length + parsed.buyingSignals.length);

  const costUsd = estimateCostUsd(model, { inputTokens, outputTokens }, 'realtime');
  const supabase = getAdminScopedClient();

  const { error: writeError } = await supabase.from('prospect_qualifications').insert({
    prospect_id: prospectId,
    verdict: parsed.verdict,
    confidence: parsed.confidence,
    segment_guess: parsed.segment ?? null,
    reasons: parsed.reasons,
    buying_signals: parsed.buyingSignals,
    model,
    prompt_version: QUALIFICATION_PROMPT_VERSION,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd,
  });

  if (writeError) return { ok: false, error: writeError.message, costUsd, inputTokens, outputTokens };

  /*
    The segment the model picked wins over the crawl's guess, and loses to a
    person.

    The guess is a keyword count; the model read the pages. But somebody who
    set the segment by hand looked at the company, and a model must not undo
    that - which is why this only moves `other` and whatever the crawl
    guessed, both of which are machine-set.
  */
  const segment: SalesSegment | undefined =
    parsed.segment && (prospect.segment === 'other' || prospect.researchStatus === 'done')
      ? (parsed.segment as SalesSegment)
      : undefined;

  const effectiveSegment = segment ?? prospect.segment;
  const contacts = await prospectService.contacts(prospectId);

  const scored = scoreProspect(
    {
      segment: effectiveSegment,
      signals: prospect.signals,
      contactsStatus: prospect.contactsStatus,
      hasSelectedContact: contacts.some((contact) => contact.selected),
    },
    { verdict: parsed.verdict, confidence: parsed.confidence, reasons: parsed.reasons, buyingSignals: parsed.buyingSignals },
  );

  const qualified = parsed.verdict !== 'unlikely';

  await supabase
    .from('prospects')
    .update({
      ...(segment ? { segment } : {}),
      qualified,
      qualified_at: new Date().toISOString(),
      disqualified_reason: qualified ? null : parsed.reasons[0]?.claim?.slice(0, 300) ?? 'Read as not a buyer',
      score: scored.score,
      score_breakdown: scored.breakdown,
      scored_at: new Date().toISOString(),
      // `disqualified` is a stage somebody can see and undo; the stage is not
      // moved past `qualified` here because contacting is a decision.
      stage: qualified ? 'qualified' : 'disqualified',
    })
    .eq('id', prospectId);

  await prospectService.recordEvent(prospectId, {
    kind: 'qualified',
    summary:
      `${parsed.verdict.replace(/_/g, ' ')} at ${parsed.confidence}% - score ${scored.score}` +
      (quotesDropped > 0 ? ` (${quotesDropped} unverifiable quote${quotesDropped === 1 ? '' : 's'} dropped)` : ''),
    detail: { model, promptVersion: QUALIFICATION_PROMPT_VERSION, costUsd, quotesDropped },
    actor: options.actor,
  });

  return {
    ok: true,
    verdict: parsed.verdict,
    costUsd,
    inputTokens,
    outputTokens,
    quotesDropped,
  };
}

export interface QualifySweepOutcome {
  idle: boolean;
  looked: number;
  succeeded: number;
  failed: number;
  costUsd: number;
  finished: boolean;
  outOfTime: boolean;
  reason?: string;
}

export async function startQualifySweep(by?: string): Promise<string | null> {
  const settings = await salesSettingsService.get();
  return salesRunService.claim('qualify', settings?.dryRun ?? true, by);
}

/**
 * Qualify everything researched but not yet read.
 *
 * Stops on the budget rather than running past it, and says so on the run row:
 * a sweep that silently stops looks identical to one that finished, and the
 * difference is whether there is work left.
 */
export async function advanceQualifySweep(
  budgetMs = DEFAULT_BUDGET_MS,
): Promise<QualifySweepOutcome> {
  const idle: QualifySweepOutcome = {
    idle: true,
    looked: 0,
    succeeded: 0,
    failed: 0,
    costUsd: 0,
    finished: false,
    outOfTime: false,
  };

  if (!isSupabaseEnabled()) return idle;

  const run = await salesRunService.live('qualify');
  if (!run) return idle;

  const settings = await salesSettingsService.get();
  if (!settings?.enabled) {
    await salesRunService.finish(run.id, { status: 'skipped', reason: 'The Sales Centre is off.' });
    return { ...idle, idle: false, finished: true, reason: 'The Sales Centre is off.' };
  }

  const started = Date.now();
  const total = { looked: 0, succeeded: 0, failed: 0, costUsd: 0 };
  let outOfTime = false;
  const supabase = getAdminScopedClient();

  for (;;) {
    if (Date.now() - started > budgetMs) {
      outOfTime = true;
      break;
    }

    /*
      Researched, and never qualified under the current prompt.

      `qualified is null` is the right filter and `stage = 'new'` is not: a
      prospect somebody moved by hand is still unread, and one re-researched
      after a redesign should be re-read. The order is by score so that where
      the budget runs out, it ran out on the least promising.
    */
    const { data, error } = await supabase
      .from('prospects')
      .select('id')
      .eq('research_status', 'done')
      .is('qualified', null)
      .order('created_at')
      .limit(CHUNK);

    if (error) {
      await salesRunService.finish(run.id, { status: 'failed', error: error.message });
      return { idle: false, ...total, finished: true, outOfTime: false, reason: error.message };
    }

    const batch = (data ?? []) as { id: string }[];
    if (batch.length === 0) break;

    for (const entry of batch) {
      if (Date.now() - started > budgetMs) {
        outOfTime = true;
        break;
      }

      total.looked += 1;
      const outcome = await qualifyProspect(entry.id, { model: settings.model, actor: run.startedBy });

      if (outcome.ok) total.succeeded += 1;
      else total.failed += 1;
      total.costUsd += outcome.costUsd ?? 0;

      await salesRunService.progress(run.id, {
        looked: 1,
        succeeded: outcome.ok ? 1 : 0,
        failed: outcome.ok ? 0 : 1,
        inputTokens: outcome.inputTokens ?? 0,
        outputTokens: outcome.outputTokens ?? 0,
        costUsd: outcome.costUsd ?? 0,
      });

      /*
        A budget refusal stops the sweep rather than being counted as a
        failure on every remaining prospect.

        Without this, a spent budget turns into four hundred "failed"
        qualifications, every one of which has to be reset by hand before the
        sweep can be run again after the budget is raised.
      */
      if (!outcome.ok && outcome.error?.includes('budget for this month is spent')) {
        await salesRunService.finish(run.id, { status: 'skipped', reason: outcome.error });
        return { idle: false, ...total, finished: true, outOfTime: false, reason: outcome.error };
      }
    }

    if (outOfTime) break;
  }

  if (outOfTime) {
    await salesRunService.release(run.id);
    return { idle: false, ...total, finished: false, outOfTime: true };
  }

  await salesRunService.finish(run.id, { status: 'completed' });
  return { idle: false, ...total, finished: true, outOfTime: false };
}
