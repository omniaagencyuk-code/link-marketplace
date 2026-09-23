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
   * Confidence and evidence, keyed by field name.
   *
   * Free-form maps rather than a field-by-field pair: the reviewer only needs
   * them for fields the model actually filled in, and a fixed shape would
   * make the model emit forty "high"s to say nothing.
   */
  confidence: z.record(z.string(), confidence),
  evidence: z.record(z.string(), z.string()),
});

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
