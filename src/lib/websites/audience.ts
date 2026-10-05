import type { AudienceCountry } from '@/lib/types';

/**
 * Where a website's readers actually are.
 *
 * A listing carries one country, which is the market it is established in and
 * is what the marketplace filters on. That single answer hides the thing a
 * buyer is usually asking: a site classified as United States can still send
 * forty per cent of its traffic to the United Kingdom, and for somebody buying
 * a link for a British client that is the whole decision.
 *
 * The shares come from Ahrefs' traffic-by-country breakdown, stored on the
 * listing by the nightly refresh. Nothing here fetches anything - opening a
 * row must never cost an API call.
 */

export interface AudienceSlice {
  /** ISO code, or 'OTHER' for the combined remainder. */
  country: string;
  /** Whole per cent, 0-100. */
  share: number;
  /** True for the combined row, which has no flag and no country page. */
  isOther: boolean;
}

/** How many countries are named before the rest are combined. */
export const NAMED_COUNTRIES = 4;

/**
 * The top few countries, with everything else combined.
 *
 * Ahrefs reports a handful of countries whose shares rarely sum to a hundred -
 * the long tail is simply not returned. So the remainder is computed from what
 * is missing rather than from the countries that were dropped, which is what
 * makes the bars add up to a whole and stops "Other" reading as zero on a site
 * with five countries and a long tail.
 */
export function audienceBreakdown(
  split: AudienceCountry[] | undefined,
  named = NAMED_COUNTRIES,
): AudienceSlice[] {
  const usable = (split ?? [])
    .filter((entry) => entry.country && Number.isFinite(entry.share) && entry.share > 0)
    .sort((a, b) => b.share - a.share);

  if (usable.length === 0) return [];

  const top = usable.slice(0, named).map((entry) => ({
    country: entry.country.toUpperCase(),
    // Clamped: a provider rounding every share up can push a single country
    // past a hundred, and a bar wider than its track looks like a bug.
    share: Math.min(100, Math.round(entry.share)),
    isOther: false,
  }));

  const accounted = top.reduce((total, entry) => total + entry.share, 0);
  const remainder = Math.max(0, 100 - accounted);

  // Only when it is worth a row. A one per cent remainder is rounding, not a
  // finding, and a row saying "Other 0%" is noise.
  if (remainder < 1) return top;

  return [...top, { country: 'OTHER', share: remainder, isOther: true }];
}

/**
 * This website's share of traffic from one country.
 *
 * Here rather than in a component because it is the arithmetic a future
 * "at least 25% UK traffic" filter needs, and the panel and that filter must
 * not disagree about what a share is.
 */
export function shareFor(split: AudienceCountry[] | undefined, country: string): number {
  const wanted = (country ?? '').trim().toUpperCase();
  if (!wanted) return 0;

  const found = (split ?? []).find((entry) => (entry.country ?? '').toUpperCase() === wanted);
  return found && Number.isFinite(found.share) ? Math.max(0, Math.round(found.share)) : 0;
}
