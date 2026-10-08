/**
 * The publisher's commercial terms, in a shape the column will accept.
 *
 * `website_commercials` is one row carrying fifteen different answers, and
 * four of its columns are constrained: two costs that must be positive, two
 * periods and a payment timing from fixed lists, and a date. One value the
 * column refuses fails the whole statement - and the statement that fails
 * takes `cost_currency` down with it, which is the unit for a cost already
 * written to `service_costs` a few lines earlier.
 *
 * 410 listings are in exactly that state: a figure for what we pay a
 * publisher, and no record of which money it is. The engine cannot convert
 * them, so it cannot price them, so they sit as drafts that will never
 * publish, and nothing said why.
 *
 * So each field is checked against what its column accepts before it goes
 * in, and one the column would refuse is dropped by name rather than
 * allowed to take the row with it. Losing a banner price is a small thing;
 * losing the currency of every cost on the listing is not, and they were
 * the same event.
 *
 * Pure, and separate from the write, so the rule can be checked without a
 * database.
 */

import { usableCurrency } from '@/lib/websites/cost-currency';

/** What `homepage_link_period` and `banner_period` accept. */
const PERIODS = new Set(['month', 'year', 'one-off']);

/** What `payment_timing` accepts. 'unknown' is the model's, not the column's. */
const TIMINGS = new Set(['prepaid', 'on-publication', 'after-live-link']);

/** Only sets a key when the model actually answered. */
function defined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * A cost in minor units, or nothing.
 *
 * The column is `check (... > 0)`, so zero is refused rather than stored.
 * That is the column's decision and not one to work around here: a quote of
 * zero is "they did not charge", which is not what this field means, and
 * recording it as a price of nothing would put a free homepage link into a
 * number we might later sell against.
 */
function positiveMinor(amount: number | null | undefined): number | null {
  if (!defined(amount) || !Number.isFinite(amount)) return null;
  const minor = Math.round(amount * 100);
  return minor > 0 ? minor : null;
}

/**
 * A date the `date` column will take.
 *
 * `price_valid_until` arrives as a free string - the extraction schema asks
 * for one and does not check it - so "end of the year", "31/12/2026" and
 * "2026-13-01" all reach the column, and all three fail it. Checked as a
 * real calendar date rather than by shape, because 2026-02-30 matches the
 * shape and is not a day.
 */
function isoDate(value: string | null | undefined): string | null {
  if (!defined(value)) return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-tripped, so an overflowing day like 2026-02-30 is caught rather
  // than being quietly rolled forward into March.
  return parsed.toISOString().slice(0, 10) === text ? text : null;
}

function oneOf(value: string | null | undefined, allowed: Set<string>): string | null {
  return defined(value) && allowed.has(value) ? value : null;
}

/** What the listing says, as far as this row is concerned. */
export interface CommercialSource {
  currency?: string | null;
  homepage_link_cost?: number | null;
  homepage_link_period?: string | null;
  banner_cost?: number | null;
  banner_period?: string | null;
  prices_exclude_vat?: boolean | null;
  vat_notes?: string | null;
  payment_methods?: string[];
  payment_timing?: string | null;
  minimum_order?: string | null;
  bulk_discount_notes?: string | null;
  price_valid_until?: string | null;
  future_price_notes?: string | null;
  notes?: string | null;
}

export interface CommercialTerms {
  /** The columns to write. Only ones the table will accept. */
  row: Record<string, unknown>;
  /**
   * Fields the model answered that the column would have refused.
   *
   * Named rather than counted, because "we dropped something" is not a thing
   * anybody can act on.
   */
  dropped: string[];
}

export function commercialTerms(listing: CommercialSource): CommercialTerms {
  const row: Record<string, unknown> = {};
  const dropped: string[] = [];

  const keep = <T>(column: string, field: string, answered: boolean, value: T | null) => {
    if (value !== null) row[column] = value;
    else if (answered) dropped.push(field);
  };

  keep('cost_currency', 'currency', defined(listing.currency), usableCurrency(listing.currency));

  keep(
    'homepage_link_cost_minor',
    'homepage_link_cost',
    defined(listing.homepage_link_cost),
    positiveMinor(listing.homepage_link_cost),
  );
  keep(
    'homepage_link_period',
    'homepage_link_period',
    defined(listing.homepage_link_period),
    oneOf(listing.homepage_link_period, PERIODS),
  );
  keep(
    'banner_cost_minor',
    'banner_cost',
    defined(listing.banner_cost),
    positiveMinor(listing.banner_cost),
  );
  keep(
    'banner_period',
    'banner_period',
    defined(listing.banner_period),
    oneOf(listing.banner_period, PERIODS),
  );

  // 'unknown' is the model declining to answer, not a value the column
  // refuses, so it is left out without being reported as dropped.
  if (defined(listing.payment_timing) && listing.payment_timing !== 'unknown') {
    keep('payment_timing', 'payment_timing', true, oneOf(listing.payment_timing, TIMINGS));
  }

  keep(
    'price_valid_until',
    'price_valid_until',
    defined(listing.price_valid_until) && listing.price_valid_until.trim() !== '',
    isoDate(listing.price_valid_until),
  );

  // Unconstrained columns: whatever the publisher said, as they said it.
  if (defined(listing.prices_exclude_vat)) row.prices_exclude_vat = listing.prices_exclude_vat;
  if (defined(listing.vat_notes)) row.vat_notes = listing.vat_notes;
  if ((listing.payment_methods ?? []).length > 0) row.payment_methods = listing.payment_methods;
  if (defined(listing.minimum_order)) row.minimum_order = listing.minimum_order;
  if (defined(listing.bulk_discount_notes)) row.bulk_discount_notes = listing.bulk_discount_notes;
  if (defined(listing.future_price_notes)) row.future_price_notes = listing.future_price_notes;
  if (defined(listing.notes)) row.notes = listing.notes;

  return { row, dropped };
}
