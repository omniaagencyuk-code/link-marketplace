import { NICHE_PROMPT_VERSION } from './niche-rules';
import type { NicheOutcome } from './niche-client';

/**
 * One homepage read, as the row that records it.
 *
 * Pure, and in its own file, so it can be checked without a database or a
 * model - which matters more here than it looks. `website_category_reads`
 * carries a constraint that a row says either what it found or why it found
 * nothing, never both and never neither. A mapping that can produce a row
 * violating it fails at the database, on somebody's first click, as a 500
 * with a constraint name in it.
 *
 * So the invariant is enforced in two places on purpose: the constraint is
 * the wall, and this is the thing that must never walk into it.
 */

export interface FetchedPage {
  url: string;
  httpStatus?: number;
  text: string;
  error?: string;
}

/** Why a read produced nothing, when the page itself was the problem. */
export const COULD_NOT_READ = 'could-not-read-the-page';

/**
 * Why a read produced nothing, when the call was the problem.
 *
 * No longer reachable from `category-read-service`, which returns a failed
 * attempt without writing anything: a call that never answered says nothing
 * about the publisher's site, and recording it would mark a site assessed
 * that nobody has assessed. Kept because this mapping has to be total - any
 * input must produce a row the table's constraint accepts - and because rows
 * written before that distinction existed still carry it.
 */
export const CALL_FAILED = 'the-model-call-failed';

export function categoryReadRow(args: {
  websiteId: string;
  page: FetchedPage;
  /** Absent when the page could not be read and no call was made. */
  outcome?: NicheOutcome;
  model: string;
  now: string;
}): Record<string, unknown> {
  const base = {
    website_id: args.websiteId,
    page_url: args.page.url,
    http_status: args.page.httpStatus ?? null,
    prompt_version: NICHE_PROMPT_VERSION,
    model: args.outcome?.model ?? args.model,
    read_at: args.now,
    /*
      A re-read replaces what the last one found, and an unapplied proposal
      is what it replaces. Clearing this is deliberate: the row now describes
      the new read, and leaving the old timestamp would say a category had
      been accepted that never was.
    */
    applied_at: null,
    applied_by: null,
    input_tokens: args.outcome?.usage?.inputTokens ?? 0,
    output_tokens: args.outcome?.usage?.outputTokens ?? 0,
  };

  /*
    Nothing to read is a result, not an error to swallow. It costs no tokens,
    so the figures stay zero and the row says why - which is the point of
    recording it at all: without this row the next attempt fetches the same
    parked domain, and the one after that.
  */
  if (args.page.error || args.page.text.trim().length === 0) {
    return {
      ...base,
      niche: null,
      confidence: null,
      quote: '',
      reason: args.page.error ?? 'The page had no readable text.',
      declined_because: COULD_NOT_READ,
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  if (args.outcome?.reading?.kind === 'proposed') {
    const { proposal } = args.outcome.reading;
    return {
      ...base,
      niche: proposal.niche,
      confidence: proposal.confidence,
      quote: proposal.quote,
      reason: proposal.reason,
      declined_because: null,
    };
  }

  return {
    ...base,
    niche: null,
    confidence: null,
    quote: '',
    reason: args.outcome?.reading?.reason || args.outcome?.error || '',
    declined_because:
      args.outcome?.reading?.kind === 'declined' ? args.outcome.reading.because : CALL_FAILED,
  };
}
