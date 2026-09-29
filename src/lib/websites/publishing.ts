import { losingPlacements, placementMargins, type TrueCostIndex } from '@/lib/utils/margin';
import type { Website } from '@/lib/types';

/**
 * Whether a listing may go on the marketplace, and why not.
 *
 * A listing cannot go active with nothing sellable. Sourcing creates listings
 * from publisher emails priced at zero and switched off - "we know what it
 * costs us, we do not know what we charge" - so the marketplace would
 * otherwise be one careless click away from showing a domain at zero, which
 * reads as free and is the one pricing mistake a customer acts on
 * immediately.
 *
 * Pure so the reason can be tested, which is the part that went wrong: the
 * guard told an owner a listing had no sell price while the admin table
 * showed $195 next to it. Both were true of different columns, and only one
 * of them was the problem.
 */
export type PublishBlocker =
  /** Nothing priced at all. */
  | 'unpriced'
  /** Priced, but every placement is switched off, so none can be bought. */
  | 'priced-but-off'
  /** On sale for at or below what we pay the publisher. */
  | 'below-cost';

export function publishBlocker(
  website: Pick<Website, 'services' | 'nichePrices'>,
  /**
   * What the listing costs us per niche, from the pricing engine.
   *
   * Optional, and the difference it makes is the rate card. Without it only
   * placements whose cost is recorded in our own currency can be judged;
   * with it, a gambling rate is measured against the gambling cost - which
   * is the one most likely to be under water, because the publisher charges
   * more for it.
   */
  costs?: TrueCostIndex,
): PublishBlocker | null {
  const sellable = website.services.filter(
    (service) => service.available && service.priceMinor > 0,
  );

  if (sellable.length === 0) {
    const priced = website.services.some((service) => service.priceMinor > 0);
    return priced ? 'priced-but-off' : 'unpriced';
  }

  /*
    Anything on sale for less than it costs us.

    The engine cannot produce one - it adds the band's markup, lifts it to the
    minimum margin and rounds the price up - so this means a price set by hand,
    or a publisher who put their price up after we priced them, which moves the
    cost and leaves the sell price exactly where it was. Nothing shouts when
    that happens, and the listing goes on selling at a loss until somebody
    notices.

    A cost in a currency we do not sell in and that the engine has not
    converted is left alone rather than compared badly: it needs the rate, the
    buffer and the payment fee before it means anything against our price, and
    none of that is on the service row.
  */
  const sellableTypes = new Set(sellable.map((service) => service.type));
  const losing = losingPlacements(
    placementMargins({ services: sellable, nichePrices: website.nichePrices }, costs),
  );

  // A topic rate on a placement that is switched off cannot be bought either.
  return losing.some((margin) => sellableTypes.has(margin.type)) ? 'below-cost' : null;
}

export function publishBlockerMessage(blocker: PublishBlocker): string {
  switch (blocker) {
    case 'priced-but-off':
      return 'This listing is priced but every placement is switched off, so nothing can be bought. Recalculate on the Pricing screen, or tick a placement on the listing itself.';
    case 'below-cost':
      return 'A placement on this listing sells for at or below what we pay the publisher. Recalculate it on the Pricing screen, which never prices below the minimum margin.';
    default:
      return 'This listing has no sell price yet. Price it on the Pricing screen, or set one by hand, before publishing it.';
  }
}
