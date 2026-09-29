import { serviceMargin } from '@/lib/utils/margin';
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

export function publishBlocker(website: Pick<Website, 'services'>): PublishBlocker | null {
  const sellable = website.services.filter(
    (service) => service.available && service.priceMinor > 0,
  );

  if (sellable.length === 0) {
    const priced = website.services.some((service) => service.priceMinor > 0);
    return priced ? 'priced-but-off' : 'unpriced';
  }

  /*
    A placement on sale for less than it costs us.

    The engine cannot produce one - it adds the band's markup, lifts it to the
    minimum margin and rounds the price up - so this means a price set by hand,
    or a publisher who put their price up after we priced them, which moves the
    cost and leaves the sell price exactly where it was. Nothing shouts when
    that happens, and the listing goes on selling at a loss until somebody
    notices.

    Only costs in our own currency are judged here. A publisher quoting in
    dollars needs the rate, the buffer and the payment fee before their number
    means anything against a sterling price, and none of that is on the service
    row - so a foreign cost is left alone rather than compared badly. The
    Websites table flags those from the engine's own figures.
  */
  const losing = sellable.some((service) => {
    const margin = serviceMargin(service);
    return margin != null && margin.profitMinor <= 0;
  });

  return losing ? 'below-cost' : null;
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
