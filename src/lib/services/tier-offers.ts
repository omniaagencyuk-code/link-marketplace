import { linkTiers } from '@/lib/config/link-tiers';
import type { LinkTier } from '@/lib/config/link-tiers';
import { MIN_READERS } from '@/lib/config/link-tiers';
import { isOffered, tierHref, tierLabel, tierQuery } from '@/lib/tiers/rules';
import { websiteService } from '@/lib/services/website-service';
import { currencySymbol, formatNumber } from '@/lib/utils/format';

/**
 * One row of the pricing table.
 *
 * Nothing here can name a publisher, and nothing here is typed into a
 * config file. A tier is a domain rating; the price and the depth behind it
 * are read from the inventory each time the page renders.
 */
export interface TierOffer {
  slug: string;
  /** e.g. "DR30+". */
  label: string;
  drMin: number;
  popular: boolean;
  /** e.g. "$96" - the cheapest listing at this rating right now. */
  fromPrice: string;
  /**
   * e.g. "$240" - the middle of them, or null where it cannot be had.
   *
   * The reason this exists. "From" is true and is the row the link lands
   * on, but one cheap listing qualifies for every tier it clears, so a
   * table showing only the cheapest printed the same figure on all six
   * rows - twice, before this was added.
   */
  typicalPrice: string | null;
  /** e.g. "2,431" - how many listings qualify. */
  sites: string;
  /** The marketplace, filtered and sorted exactly as this row was priced. */
  browseHref: string;
}

/**
 * One tier, priced against the inventory as it stands.
 *
 * Null where there is too little stock to quote on. A row advertising a
 * price we can fill twice sends somebody to a marketplace page with almost
 * nothing on it, which is worse than not offering the tier - the judgement
 * `MIN_LISTINGS_FOR_A_PAGE` already makes about a thin niche.
 *
 * One listing and a count come back, which is all the row prints. The
 * listing is the cheapest at this rating, so "from" is a fact rather than a
 * rounding, and it is the same row the link lands on.
 */
export async function tierOffer(tier: LinkTier): Promise<TierOffer | null> {
  const { items, total } = await websiteService.search(tierQuery(tier));

  if (!isOffered(total)) return null;

  const cheapest = items[0];
  // A count above the floor with no row back would mean the two disagreed;
  // say nothing rather than print a price that came from nowhere.
  if (!cheapest) return null;

  return {
    slug: tier.slug,
    label: tierLabel(tier),
    drMin: tier.drMin,
    popular: tier.popular === true,
    /*
      The symbol and the number, the way the niche pages print a starting
      price - not `formatPrice`, which renders en-GB + USD as "US$125".
      That is correct and it is what the marketplace's own totals show, but
      this is a public page quoting a headline figure and the other public
      page quoting one reads "$8". Whole units, because a tier price is a
      floor rather than a quotation and cents imply a precision the
      marketplace reprices out from under it.
    */
    fromPrice: money(cheapest.headlinePriceMinor),
    // A clone has no median to offer, and the column is dropped rather than
    // filled with the figure beside it.
    typicalPrice: null,
    sites: formatNumber(total),
    browseHref: tierHref(tier),
  };
}

/**
 * Every tier worth quoting, strongest sites last.
 *
 * Six small reads rather than one big one: each asks for a single row and a
 * count, which is the shape this codebase arrived at the hard way after
 * /guest-posts spent a month timing out reading the whole inventory to
 * describe part of it.
 */
/** Minor units as the page prints them: whole, with the brand's symbol. */
function money(minor: number): string {
  return `${currencySymbol()}${formatNumber(Math.round(minor / 100))}`;
}

/**
 * Every tier worth quoting, weakest rating first.
 *
 * One read where there is a database: `tier_price_bands` answers for all
 * six at once, and it is the only way to get a median at all - a middle
 * needs every qualifying row, and there are thousands. It also takes the
 * page from six round trips to one, which on this infrastructure is the
 * difference the region pinning in `vercel.json` was done for.
 *
 * The per-tier read below is what a clone falls back to. It can produce the
 * count and the cheapest but not the middle, so those offers carry no
 * typical price and the column is left out rather than filled with the
 * number next to it.
 */
export async function tierOffers(): Promise<TierOffer[]> {
  const bands = await websiteService.tierPriceBands(MIN_READERS);

  if (bands.length > 0) {
    const byRating = new Map(bands.map((band) => [band.drMin, band]));

    return linkTiers.flatMap((tier) => {
      const band = byRating.get(tier.drMin);
      if (!band || !isOffered(band.listings) || band.fromMinor === null) return [];

      return [
        {
          slug: tier.slug,
          label: tierLabel(tier),
          drMin: tier.drMin,
          popular: tier.popular === true,
          fromPrice: money(band.fromMinor),
          typicalPrice: band.medianMinor === null ? null : money(band.medianMinor),
          sites: formatNumber(band.listings),
          browseHref: tierHref(tier),
        },
      ];
    });
  }

  const offers = await Promise.all(linkTiers.map((tier) => tierOffer(tier)));

  return offers.filter((offer): offer is TierOffer => offer !== null);
}
