import type { ContentPricing, ContentTypeSlug } from '@/lib/types/content';

/**
 * Content pricing maths.
 *
 * Pure functions so the order form, the dashboard and the admin queue all
 * arrive at the same number. Everything returns null when pricing has not been
 * configured yet, which callers render as "price on request" rather than as
 * zero - an unset price is not a free one.
 */

/** True when an actual price has been set somewhere in the configuration. */
export function isPricingConfigured(pricing: ContentPricing): boolean {
  if (pricing.mode === 'per-word') return pricing.perWordMinor > 0;
  return pricing.tiers.some((tier) => tier.priceMinor > 0);
}

/**
 * Price for one article, in minor units, or null when it cannot be priced.
 *
 * Tiered pricing charges the smallest tier that covers the requested length;
 * a length above every tier falls back to per-word if that is set, otherwise
 * it is quoted manually.
 */
export function priceForWords(
  pricing: ContentPricing,
  words: number,
  contentType?: ContentTypeSlug,
): number | null {
  if (!Number.isFinite(words) || words <= 0) return null;

  let base: number | null = null;

  if (pricing.mode === 'per-word') {
    base = pricing.perWordMinor > 0 ? Math.round(pricing.perWordMinor * words) : null;
  } else {
    const tiers = [...pricing.tiers]
      .filter((tier) => tier.priceMinor > 0)
      .sort((a, b) => a.words - b.words);
    const match = tiers.find((tier) => tier.words >= words);
    if (match) base = match.priceMinor;
    else if (pricing.perWordMinor > 0) base = Math.round(pricing.perWordMinor * words);
  }

  if (base === null) return null;

  const surcharge = contentType ? (pricing.typeSurchargePct[contentType] ?? 0) : 0;
  return Math.round(base * (1 + surcharge / 100));
}

/** The price table shown on the public content page, cheapest tier first. */
export function pricingTable(
  pricing: ContentPricing,
  lengths: readonly number[],
): { words: number; priceMinor: number | null }[] {
  return lengths.map((words) => ({ words, priceMinor: priceForWords(pricing, words) }));
}
