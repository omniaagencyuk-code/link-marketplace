import type { Website, WebsiteListItem } from '@/lib/types';

/**
 * Which other listings to show at the bottom of a listing page.
 *
 * Pure, and shared by the database path and the mock one, because a strip
 * that ranks differently depending on which data source is behind it is a
 * strip nobody can reason about.
 *
 * ## Why this is not "the first few in the niche"
 *
 * It used to be. `getRelated` fetched sixty complete listings in no
 * particular order, filtered them to the matching niche in JavaScript and
 * kept four. Two things were wrong with that. It hauled sixty rows with every
 * join across the wire to use four of them - and because the sixty were
 * unordered, a niche holding thirty sites out of eighteen hundred could easily
 * miss all thirty, so the strip came back empty while being wrong about there
 * being nothing to show.
 *
 * The database now does the filtering and hands over a handful of candidates
 * either side of this listing's Domain Rating. This decides which of them are
 * closest.
 */

/** The fields the ranking actually reads, so a caller can pass anything. */
export interface RelatedCandidate {
  slug: string;
  metrics: { domainRating: number };
}

/**
 * Closest by Domain Rating, nearest first.
 *
 * DR is the comparison a buyer is making when they look at the strip: another
 * site in the same niche at roughly the same authority is a genuine
 * alternative, and one at DR 12 next to a DR 80 is not.
 *
 * Ties break on the slug rather than being left to whatever order the rows
 * arrived in. Two sites at the same DR would otherwise swap places between
 * page loads, which looks like the page is broken even though nothing is.
 */
export function rankRelated<T extends RelatedCandidate>(
  candidates: T[],
  current: { slug: string; metrics: { domainRating: number } },
  limit: number,
): T[] {
  const target = current.metrics.domainRating;
  const seen = new Set<string>();

  return candidates
    // The two queries that feed this overlap at the boundary, and the mock
    // path can hand over the current listing itself.
    .filter((candidate) => {
      if (candidate.slug === current.slug || seen.has(candidate.slug)) return false;
      seen.add(candidate.slug);
      return true;
    })
    .sort((a, b) => {
      const byCloseness =
        Math.abs(a.metrics.domainRating - target) - Math.abs(b.metrics.domainRating - target);
      return byCloseness !== 0 ? byCloseness : a.slug.localeCompare(b.slug);
    })
    .slice(0, Math.max(0, limit));
}

/**
 * How many rows to ask the database for on each side of the target.
 *
 * The limit itself, which is enough: the nearest four overall are always
 * within the nearest four above plus the nearest four below. Asking for more
 * would be fetching rows that cannot win.
 */
export function candidatesPerSide(limit: number): number {
  return Math.max(1, limit);
}

/** Narrowed so the ranking cannot accidentally depend on the whole listing. */
export function relatedTarget(website: Website): {
  slug: string;
  metrics: { domainRating: number };
} {
  return { slug: website.slug, metrics: { domainRating: website.metrics.domainRating } };
}

export type { WebsiteListItem };
