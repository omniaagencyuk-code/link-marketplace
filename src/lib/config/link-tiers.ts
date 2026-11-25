/**
 * The domain rating tiers the pricing table is built from.
 *
 * Six bands, each a MINIMUM rather than a range: somebody buying a link
 * thinks "I want DR 30 or better", not "I want DR 30 to 45". The bands this
 * replaced were ranges, and against the real inventory every card filled
 * with listings sitting exactly on the ceiling - which is what a range
 * sorted from one end always gives you.
 *
 * ## There are no prices here
 *
 * A tier is a domain rating and nothing else. Every figure beside it on the
 * page - the price, how many sites there are - is read from the inventory at
 * request time. A price typed into this file would be one the marketplace
 * stopped charging the moment a publisher repriced, and it would fix a
 * currency besides, which `brand.ts` settled: publishers bill us in dollars
 * and we charge in dollars so that nothing sits between the two numbers.
 *
 * Nor is there a traffic band. The page this is modelled on prints one per
 * tier, and ours cannot yet: an honest band is a typical range rather than
 * the true minimum and maximum, which across every listing above DR 10
 * would read "0 to 200M" and mean nothing. A typical range needs a
 * percentile taken in Postgres, and inventing one to fill the column is the
 * thing `niche-rules.ts` calls replacing an invented figure with a
 * differently invented one.
 */
/**
 * The fewest readers a placement we quote a price on may have.
 *
 * The table shipped without one and said so immediately: all six tiers read
 * "$8 / placement", because a single cheap listing with no audience
 * qualifies for DR10+ and DR60+ alike and the price shown is the cheapest
 * that qualifies. Six rows carrying one number tell a buyer nothing.
 *
 * It is the same fault the packages had before this - a DR 45 listing at
 * zero organic traffic under a promise of real readers - and the same rule
 * fixes it. `niche-landing.ts` puts it best: "a publisher with a strong
 * domain rating and no readers is the thing buyers in this industry are
 * most often sold". Its own floor of 500 keeps such a listing out of a
 * sample table; this is a price somebody budgets against, so it is higher.
 *
 * It also makes the counts honest. A tier's "sites available" should be
 * sites worth selling, not every row that clears the rating.
 */
export const MIN_READERS = 1_000;

export interface LinkTier {
  /** URL-safe, e.g. `dr30`. */
  slug: string;
  /** The floor. A listing qualifies at this rating or better. */
  drMin: number;
  /** Marked on the table. At most one tier carries it. */
  popular?: boolean;
}

export const linkTiers: LinkTier[] = [
  { slug: 'dr10', drMin: 10 },
  { slug: 'dr20', drMin: 20 },
  { slug: 'dr30', drMin: 30, popular: true },
  { slug: 'dr40', drMin: 40 },
  { slug: 'dr50', drMin: 50 },
  { slug: 'dr60', drMin: 60 },
];
