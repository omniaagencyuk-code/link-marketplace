import { z } from 'zod';
import { salesSegments } from '@/lib/config/sales-segments';

/**
 * The shape the model must answer in.
 *
 * Structured output rather than "return JSON": the schema is enforced by the
 * API, so a malformed answer is the API's problem rather than a parse failure
 * we discover after paying for it.
 *
 * ## Why the sentinels
 *
 * The wire schema has no optional fields and no nulls. A model given an
 * optional field will sometimes omit it and sometimes emit `null`, and the two
 * arrive as the same undefined after parsing - which loses the difference
 * between "nothing to say" and "the field did not come back". So every field
 * is required, "unknown" is spelled with a value, and the sentinels are turned
 * back into absence at this boundary. Nothing downstream ever sees the shape
 * the wire forced on us. The same arrangement `sourcing/schema.ts` uses.
 */

const segmentSlugs = salesSegments.map((segment) => segment.slug) as [string, ...string[]];

const reasonSchema = z.object({
  claim: z.string(),
  /** Words copied from their own copy. Empty means the model had none. */
  quote: z.string(),
  /** Empty where the model could not say which page. */
  url: z.string(),
});

export const wireQualificationSchema = z.object({
  verdict: z.enum(['likely_buyer', 'unlikely', 'unclear']),
  confidence: z.number(),
  /** `unknown` rather than an omitted field. */
  segment: z.enum([...segmentSlugs, 'unknown'] as [string, ...string[]]),
  reasons: z.array(reasonSchema),
  buying_signals: z.array(reasonSchema),
});

export type WireQualification = z.infer<typeof wireQualificationSchema>;

export interface ParsedQualification {
  verdict: 'likely_buyer' | 'unlikely' | 'unclear';
  confidence: number;
  segment?: string;
  reasons: { claim: string; quote: string; url?: string }[];
  buyingSignals: { claim: string; quote: string; url?: string }[];
}

/**
 * Sentinels back to absence, and unquoted claims dropped.
 *
 * The prompt says a reason without a quote should be left out. This is the
 * enforcement rather than the request: a reason that arrives with an empty
 * quote is removed here, so nothing downstream - the score, the panel, the
 * email - can be built on a claim nobody can check. A model that ignores the
 * rule loses the claim rather than getting it through.
 */
export function fromWire(wire: WireQualification): ParsedQualification {
  const keepQuoted = (entries: WireQualification['reasons']) =>
    entries
      .filter((entry) => entry.quote.trim().length > 0 && entry.claim.trim().length > 0)
      .map((entry) => ({
        claim: entry.claim.trim(),
        quote: entry.quote.trim(),
        url: entry.url.trim() || undefined,
      }));

  return {
    verdict: wire.verdict,
    // Clamped rather than trusted: a confidence of 140 is not a number we
    // want reaching a column with a 0-100 check on it.
    confidence: Math.max(0, Math.min(100, Math.round(wire.confidence))),
    segment: wire.segment === 'unknown' ? undefined : wire.segment,
    reasons: keepQuoted(wire.reasons),
    buyingSignals: keepQuoted(wire.buying_signals),
  };
}

/**
 * Does the quote actually appear in what the model was shown?
 *
 * The prompt asks for words copied exactly. Asking is not the same as
 * checking, and this is the check: a quote that is not in the source text was
 * composed rather than copied, however plausible it reads. Whitespace is
 * normalised first, because the text given to the model has already been
 * collapsed and a model re-wrapping a line is not a fabrication.
 */
export function quoteIsReal(quote: string, sourceText: string): boolean {
  const flatten = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
  const needle = flatten(quote);
  if (needle.length < 3) return false;
  return flatten(sourceText).includes(needle);
}
