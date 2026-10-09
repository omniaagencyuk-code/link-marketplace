import { z } from 'zod';
import { categories } from '@/lib/data/categories';
import { NICHE_CONFIDENCE_FLOOR } from './niche-rules';
import type { NicheSlug } from '@/lib/types';

/**
 * The shape the model must answer in, and what the answer is worth.
 *
 * Structured output rather than "return JSON": the schema is enforced by the
 * API, so a category that is not one of ours is the API's problem rather than
 * a bad row we discover after paying for it.
 *
 * ## Why the sentinel
 *
 * No optional fields and no nulls on the wire. A model given an optional
 * field will sometimes omit it and sometimes send `null`, and both arrive as
 * the same `undefined` - which loses the difference between "nothing to say"
 * and "the field did not come back". So `unknown` is spelled with a value and
 * turned back into absence here. The arrangement `sourcing/schema.ts` and
 * `sales/qualification-schema.ts` both use.
 */

const slugs = categories.map((category) => category.slug) as [string, ...string[]];

export const wireNicheSchema = z.object({
  /** One of ours, or the sentinel. The enum is what stops an invented slug. */
  niche: z.enum([...slugs, 'unknown'] as [string, ...string[]]),
  confidence: z.number(),
  /** Copied from the page. Empty where the model had none. */
  quote: z.string(),
  /** One sentence for whoever reviews it. */
  reason: z.string(),
});

export type WireNiche = z.infer<typeof wireNicheSchema>;

/** What a homepage read produced, once it has been checked. */
export interface NicheProposal {
  niche: NicheSlug;
  confidence: number;
  quote: string;
  reason: string;
}

/** Why there is no proposal, which is as much worth recording as one. */
export type NicheRefusal =
  | 'model-said-unknown'
  | 'below-the-floor'
  | 'no-quote'
  | 'quote-not-on-the-page';

export type NicheReading =
  | { kind: 'proposed'; proposal: NicheProposal }
  | { kind: 'declined'; because: NicheRefusal; reason: string };

/**
 * Loose enough to survive a page, strict enough to still be a check.
 *
 * The excerpt reaching the model has already been through `readPage`, which
 * collapses the whitespace HTML leaves behind; a model copying a sentence out
 * of it will reproduce the words and may not reproduce the spacing, and
 * curly quotes come back straight about as often as not. Comparing the raw
 * strings would fail on punctuation and teach whoever maintains this to
 * delete the check.
 *
 * So both sides are flattened to lower case, one-space-separated words with
 * the quote marks and dashes normalised. What survives is the thing worth
 * testing: are these the page's words, in this order?
 */
function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shorter than this is not a quote, it is a word that happens to appear. */
const MIN_QUOTE_CHARS = 12;

/**
 * What to do with one answer.
 *
 * The quote is **checked, not trusted** - the rule `checkDraft` applies to a
 * price in an outbound email, for the same reason: a model asked to quote
 * will usually quote and will sometimes write what the page ought to have
 * said. A category resting on a sentence the page does not contain is a
 * category resting on nothing, and it would arrive in the review queue
 * looking exactly like the ones that rest on something.
 *
 * Every refusal is named rather than returned as a bare null, because
 * "nothing came back" and "it quoted a sentence that is not there" are
 * different problems and only one of them is worth re-running.
 */
export function readNiche(answer: WireNiche, pageText: string): NicheReading {
  const quote = answer.quote.trim();

  if (answer.niche === 'unknown') {
    return {
      kind: 'declined',
      because: 'model-said-unknown',
      reason: answer.reason.trim(),
    };
  }

  /*
    The floor is applied here rather than left to the reviewer.

    A queue full of coin flips teaches whoever works it to click through, and
    then the ones worth reading go through with them.
  */
  if (!Number.isFinite(answer.confidence) || answer.confidence < NICHE_CONFIDENCE_FLOOR) {
    return {
      kind: 'declined',
      because: 'below-the-floor',
      reason: answer.reason.trim(),
    };
  }

  if (quote.length < MIN_QUOTE_CHARS) {
    return { kind: 'declined', because: 'no-quote', reason: answer.reason.trim() };
  }

  if (!comparable(pageText).includes(comparable(quote))) {
    return {
      kind: 'declined',
      because: 'quote-not-on-the-page',
      reason: answer.reason.trim(),
    };
  }

  return {
    kind: 'proposed',
    proposal: {
      niche: answer.niche as NicheSlug,
      // Clamped: a model asked for 0-100 occasionally answers 120, and a
      // confidence above the maximum sorts above everything real.
      confidence: Math.max(0, Math.min(100, Math.round(answer.confidence))),
      quote,
      reason: answer.reason.trim(),
    },
  };
}
