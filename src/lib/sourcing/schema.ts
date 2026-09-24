import { z } from 'zod';
import { sensitiveNicheSlugs } from '@/lib/config/accepted-niches';

/**
 * What the model is allowed to return.
 *
 * This is the schema sent to the API *and* the validator run on the reply.
 * One definition, so "what we asked for" and "what we accept" cannot drift -
 * a mismatch between those two is how a field silently stops being read.
 *
 * Every field is nullable rather than optional. A publisher's email is mostly
 * silence, and a schema that lets silence be an absent key makes "the model
 * did not answer" and "the model answered nothing" the same shape. Null is an
 * answer: it means not stated.
 */

const stance = z.enum(['yes', 'no', 'unknown']);
const confidence = z.enum(['high', 'medium', 'low']);

/** A price in the publisher's own currency, in whole units. Never converted. */
const money = z.number().positive().nullable();

const period = z.enum(['month', 'year', 'one-off']).nullable();

const nicheTerms = z.object({
  accepted: stance,
  guest_post_cost: money,
  link_insertion_cost: money,
});

/**
 * One domain's terms.
 *
 * A reply covering eleven sites produces eleven of these, each with its own
 * prices and its own exceptions - which is the whole reason this is an array
 * rather than one object per email.
 */
export const extractedListingSchema = z.object({
  domain: z.string(),
  /**
   * Other domains the very same terms cover.
   *
   * A publisher with a network quotes one rate and lists thirty sites. Asking
   * the model to repeat forty fields thirty times would cost thirty times as
   * much, risk truncation, and invite it to drift between copies. It says the
   * terms once and names the domains; the expansion is done in code, where it
   * is exact and auditable.
   */
  also_applies_to: z.array(z.string()),
  /**
   * Why this domain is here when it is not the one we wrote to - e.g. the
   * publisher declined for the site we asked about and offered another.
   */
  relationship: z.string().nullable(),

  contact_email: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_notes: z.string().nullable(),

  language: z.string().nullable(),
  currency: z.string().nullable(),

  guest_post_cost: money,
  guest_post_cost_written_by_publisher: money,
  link_insertion_cost: money,
  homepage_link_cost: money,
  homepage_link_period: period,
  banner_cost: money,
  banner_period: period,

  niches: z.object(
    Object.fromEntries(sensitiveNicheSlugs.map((slug) => [slug, nicheTerms])) as Record<
      string,
      typeof nicheTerms
    >,
  ),

  dofollow: stance,
  sponsored_tag: z.enum(['yes', 'no', 'depends', 'unknown']),
  dofollow_expires_after_months: z.number().int().positive().nullable(),
  permanence: z.enum(['permanent', 'fixed-term', 'unknown']),
  min_live_months: z.number().int().positive().nullable(),
  min_word_count: z.number().int().positive().nullable(),
  max_word_count: z.number().int().positive().nullable(),
  max_links: z.number().int().positive().nullable(),
  turnaround_min_days: z.number().int().positive().nullable(),
  turnaround_max_days: z.number().int().positive().nullable(),
  link_insertion_offered: stance,
  homepage_placement: stance,
  topic_restriction: z.string().nullable(),

  prices_exclude_vat: z.boolean().nullable(),
  vat_notes: z.string().nullable(),
  payment_methods: z.array(
    z.enum(['paypal', 'bank', 'invoice', 'crypto', 'pix', 'upi', 'western_union']),
  ),
  payment_timing: z.enum(['prepaid', 'on-publication', 'after-live-link', 'unknown']),

  minimum_order: z.string().nullable(),
  bulk_discount_notes: z.string().nullable(),
  price_valid_until: z.string().nullable(),
  future_price_notes: z.string().nullable(),

  /** Anything with no field of its own, in plain English whatever the email's language. */
  notes: z.string().nullable(),

  /**
   * Confidence and evidence, one entry per field the model filled in.
   *
   * Arrays, not maps, and that is not a style choice. Structured outputs
   * require a strict JSON Schema, and a Zod record compiles to
   * `{type: "object", properties: {}, additionalProperties: false}` - a
   * closed, empty object the model is forbidden from putting anything in.
   * Silently: it returns `{}`, every draft reads as fully confident, and the
   * flag that keeps a guessed price away from bulk approve never fires.
   *
   * An array of closed objects has no such problem. They are turned back
   * into maps on the way into the database, which is the shape the review
   * screen wants.
   */
  confidence: z.array(z.object({ field: z.string(), level: confidence })),
  evidence: z.array(z.object({ field: z.string(), quote: z.string() })),
});

/** The array the model returns, as the map everything downstream reads. */
export function asMap<T extends { field: string }, V>(
  entries: T[],
  value: (entry: T) => V,
): Record<string, V> {
  return Object.fromEntries(entries.map((entry) => [entry.field, value(entry)]));
}

export const extractionResultSchema = z.object({
  /**
   * False for a canned reply, a sales page with no numbers, or an email whose
   * domain cannot be identified. An unusable email is marked ignored with the
   * reason below rather than producing an empty draft nobody can action.
   */
  usable: z.boolean(),
  ignore_reason: z.string().nullable(),
  listings: z.array(extractedListingSchema),
});

export type ExtractedListing = z.infer<typeof extractedListingSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type Stance = z.infer<typeof stance>;

// ---------------------------------------------------------------- the wire

/**
 * The same data, in the shape the API will actually accept.
 *
 * Structured outputs compile the schema into a constrained decoder, and every
 * nullable field is a union - `["number","null"]`. There is a hard limit of 16
 * union-typed parameters per schema, and a reply about a publisher's terms has
 * about thirty fields that can legitimately be absent. The request is refused
 * outright: "too many parameters with union types ... exponential compilation
 * cost".
 *
 * So nothing on the wire is nullable. Absence is a sentinel: 0 for a number,
 * "" for a string, "unknown" for a stance. That costs nothing in meaning here
 * because none of these numbers can legitimately be zero - a price, a word
 * count, a number of months - and the sentinels are turned back into null by
 * `fromWire` before anything else sees them.
 *
 * The internal shape above keeps its nulls. This one exists only for the
 * journey there and back.
 */

const wireMoney = z.number().describe('0 when the email does not say');
const wirePeriod = z.enum(['month', 'year', 'one-off', '']);

const wireNiche = z.object({
  accepted: stance,
  guest_post_cost: wireMoney,
  link_insertion_cost: wireMoney,
});

export const wireListingSchema = z.object({
  domain: z.string(),
  /** Other domains these same terms cover. Empty for a single-site reply. */
  also_applies_to: z.array(z.string()),
  relationship: z.string(),

  contact_email: z.string(),
  contact_name: z.string(),
  contact_notes: z.string(),

  language: z.string(),
  currency: z.string(),

  guest_post_cost: wireMoney,
  guest_post_cost_written_by_publisher: wireMoney,
  link_insertion_cost: wireMoney,
  homepage_link_cost: wireMoney,
  homepage_link_period: wirePeriod,
  banner_cost: wireMoney,
  banner_period: wirePeriod,

  niches: z.object(
    Object.fromEntries(sensitiveNicheSlugs.map((slug) => [slug, wireNiche])) as Record<
      string,
      typeof wireNiche
    >,
  ),

  dofollow: stance,
  sponsored_tag: z.enum(['yes', 'no', 'depends', 'unknown']),
  dofollow_expires_after_months: z.number(),
  permanence: z.enum(['permanent', 'fixed-term', 'unknown']),
  min_live_months: z.number(),
  min_word_count: z.number(),
  max_word_count: z.number(),
  max_links: z.number(),
  turnaround_min_days: z.number(),
  turnaround_max_days: z.number(),
  link_insertion_offered: stance,
  homepage_placement: stance,
  topic_restriction: z.string(),

  prices_exclude_vat: z.enum(['yes', 'no', 'unknown']),
  vat_notes: z.string(),
  payment_methods: z.array(
    z.enum(['paypal', 'bank', 'invoice', 'crypto', 'pix', 'upi', 'western_union']),
  ),
  payment_timing: z.enum(['prepaid', 'on-publication', 'after-live-link', 'unknown']),

  minimum_order: z.string(),
  bulk_discount_notes: z.string(),
  price_valid_until: z.string(),
  future_price_notes: z.string(),

  notes: z.string(),

  confidence: z.array(z.object({ field: z.string(), level: confidence })),
  evidence: z.array(z.object({ field: z.string(), quote: z.string() })),
});

export const wireResultSchema = z.object({
  usable: z.boolean(),
  ignore_reason: z.string(),
  listings: z.array(wireListingSchema),
});

export type WireResult = z.infer<typeof wireResultSchema>;

/** A sentinel back to the absence it stands for. */
const text = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const amount = (value: number): number | null => (value > 0 ? value : null);

export function fromWire(result: WireResult): ExtractionResult {
  return {
    usable: result.usable,
    ignore_reason: text(result.ignore_reason),
    listings: result.listings.map((listing) => ({
      domain: listing.domain,
      also_applies_to: listing.also_applies_to,
      relationship: text(listing.relationship),
      contact_email: text(listing.contact_email),
      contact_name: text(listing.contact_name),
      contact_notes: text(listing.contact_notes),
      language: text(listing.language),
      currency: text(listing.currency),
      guest_post_cost: amount(listing.guest_post_cost),
      guest_post_cost_written_by_publisher: amount(listing.guest_post_cost_written_by_publisher),
      link_insertion_cost: amount(listing.link_insertion_cost),
      homepage_link_cost: amount(listing.homepage_link_cost),
      homepage_link_period: listing.homepage_link_period === '' ? null : listing.homepage_link_period,
      banner_cost: amount(listing.banner_cost),
      banner_period: listing.banner_period === '' ? null : listing.banner_period,
      niches: Object.fromEntries(
        Object.entries(listing.niches).map(([slug, terms]) => [
          slug,
          {
            accepted: terms.accepted,
            guest_post_cost: amount(terms.guest_post_cost),
            link_insertion_cost: amount(terms.link_insertion_cost),
          },
        ]),
      ),
      dofollow: listing.dofollow,
      sponsored_tag: listing.sponsored_tag,
      dofollow_expires_after_months: amount(listing.dofollow_expires_after_months),
      permanence: listing.permanence,
      min_live_months: amount(listing.min_live_months),
      min_word_count: amount(listing.min_word_count),
      max_word_count: amount(listing.max_word_count),
      max_links: amount(listing.max_links),
      turnaround_min_days: amount(listing.turnaround_min_days),
      turnaround_max_days: amount(listing.turnaround_max_days),
      link_insertion_offered: listing.link_insertion_offered,
      homepage_placement: listing.homepage_placement,
      topic_restriction: text(listing.topic_restriction),
      prices_exclude_vat:
        listing.prices_exclude_vat === 'unknown' ? null : listing.prices_exclude_vat === 'yes',
      vat_notes: text(listing.vat_notes),
      payment_methods: listing.payment_methods,
      payment_timing: listing.payment_timing,
      minimum_order: text(listing.minimum_order),
      bulk_discount_notes: text(listing.bulk_discount_notes),
      price_valid_until: text(listing.price_valid_until),
      future_price_notes: text(listing.future_price_notes),
      notes: text(listing.notes),
      confidence: listing.confidence,
      evidence: listing.evidence,
    })),
  };
}
