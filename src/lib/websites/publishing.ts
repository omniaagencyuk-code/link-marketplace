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
  | 'priced-but-off';

export function publishBlocker(website: Pick<Website, 'services'>): PublishBlocker | null {
  const sellable = website.services.some(
    (service) => service.available && service.priceMinor > 0,
  );
  if (sellable) return null;

  const priced = website.services.some((service) => service.priceMinor > 0);
  return priced ? 'priced-but-off' : 'unpriced';
}

export function publishBlockerMessage(blocker: PublishBlocker): string {
  return blocker === 'priced-but-off'
    ? 'This listing is priced but every placement is switched off, so nothing can be bought. Recalculate on the Pricing screen, or tick a placement on the listing itself.'
    : 'This listing has no sell price yet. Price it on the Pricing screen, or set one by hand, before publishing it.';
}
