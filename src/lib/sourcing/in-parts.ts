import type { ExtractionResult } from './schema';

/**
 * Reading a reply that lists more sites than one answer can hold.
 *
 * Five agency replies hit the output ceiling, each listing several hundred
 * domains. The error told whoever read it to paste the email in two halves by
 * hand - work the thing that noticed should be doing, and these were
 * publishers worth having.
 *
 * The input was never the problem. A long rate card is a few thousand tokens
 * in and a hundred thousand out, because every domain expands into forty-odd
 * fields. So the email is never split: splitting it would hand the second half
 * to the model without the header row of the table, without the currency
 * stated once at the top, and without the terms that apply to every site below
 * them. The listings read from it would be quietly wrong rather than visibly
 * missing, which is the worse of the two failures.
 *
 * Instead the whole email goes in every time and only the answer is divided -
 * each pass is told which domains to return. The decisions that shape that are
 * here, apart from the calls, so they can be checked without an API key.
 */

/** Domains per pass. At ~440 tokens a listing this leaves most of the ceiling spare. */
export const DOMAINS_PER_PASS = 40;

/** A reply naming more domains than this is not a rate card, it is a database. */
export const MOST_DOMAINS_WORTH_READING = 600;

/**
 * The domains to ask for, in the order they were found, each one once.
 *
 * Trimmed and deduplicated case-insensitively: a rate card that lists a domain
 * twice - once in a summary and once in the table - would otherwise buy a whole
 * extra pass to be told about it again.
 */
export function domainsToRead(raw: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const entry of raw) {
    const domain = entry.trim();
    if (!domain) continue;
    const key = domain.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(domain);
  }

  return kept;
}

/** The domains split into the batches each pass will be asked for. */
export function passes(domains: string[], size = DOMAINS_PER_PASS): string[][] {
  if (size < 1) throw new Error('A pass has to ask for at least one domain.');
  const batches: string[][] = [];
  for (let start = 0; start < domains.length; start += size) {
    batches.push(domains.slice(start, start + size));
  }
  return batches;
}

/**
 * The parts, back into one result.
 *
 * `usable` is true if any pass found something to sell - a rate card whose
 * first forty domains are all "we don't do that any more" is still a usable
 * email if domain forty-one has a price.
 *
 * A domain repeated across passes is kept once, at its first reading: a later
 * pass was asked about other domains and has nothing better to say about this
 * one.
 */
export function mergeParts(parts: ExtractionResult[]): ExtractionResult {
  const listings: ExtractionResult['listings'] = [];
  const seen = new Set<string>();
  let usable = false;
  let ignoreReason: string | null = null;

  for (const part of parts) {
    if (part.usable) usable = true;
    ignoreReason ??= part.ignore_reason;

    for (const listing of part.listings) {
      const key = listing.domain.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      listings.push(listing);
    }
  }

  return {
    usable,
    // A reason to ignore the email only means anything if nothing was usable.
    ignore_reason: usable ? null : ignoreReason,
    listings,
  };
}

/** What one pass costs, so the whole retry can be charged honestly. */
export interface PartUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface PartsOutcome {
  result?: ExtractionResult;
  error?: string;
  usage: PartUsage;
}

/**
 * Read a too-long reply in parts, given the two ways of asking.
 *
 * The calls are arguments rather than imports so this can be driven by a fake
 * - the sequence it performs is the thing worth checking, and against the real
 * API that check would cost money to run and could not assert what was asked.
 *
 * `listDomains` names the sites the reply offers; `readBatch` extracts the
 * listings for a named subset, and must be given the whole email every time.
 */
export async function readInParts(
  listDomains: () => Promise<{ domains: string[] | null; usage: PartUsage }>,
  readBatch: (domains: string[]) => Promise<{ result?: ExtractionResult; error?: string; usage: PartUsage }>,
  alreadySpent: PartUsage,
): Promise<PartsOutcome> {
  const usage: PartUsage = { ...alreadySpent };
  const spend = (part: PartUsage) => {
    usage.inputTokens += part.inputTokens;
    usage.outputTokens += part.outputTokens;
  };

  const listed = await listDomains();
  spend(listed.usage);

  const domains = domainsToRead(listed.domains ?? []);
  if (domains.length === 0) {
    return {
      error:
        'This reply lists more sites than one answer can hold, and the domains in it could not be listed either. It needs reading by hand.',
      usage,
    };
  }

  if (domains.length > MOST_DOMAINS_WORTH_READING) {
    return {
      error: `This reply lists ${domains.length} domains. That is a database rather than a rate card - import it as a CSV instead of reading it as an email.`,
      usage,
    };
  }

  /*
    One pass at a time, not all at once.

    Each pass resends the whole email, so running fifteen of them together is
    fifteen times the input in flight and a rate limit that fails the lot.
    These already cost a retry; they are not in a hurry.
  */
  const parts: ExtractionResult[] = [];
  const batches = passes(domains);

  for (const [index, batch] of batches.entries()) {
    const part = await readBatch(batch);
    spend(part.usage);

    if (part.error || !part.result) {
      return {
        error: `Reading this reply in parts failed on part ${index + 1} of ${batches.length} (${batch.length} domains): ${part.error ?? 'no result'}`,
        usage,
      };
    }

    parts.push(part.result);
  }

  return { result: mergeParts(parts), usage };
}
