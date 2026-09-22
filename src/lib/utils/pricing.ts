import type { LinkTypeSlug, NichePrice, Website } from '@/lib/types';

/**
 * Reading a rate card out of the overrides.
 *
 * The stored form is sparse on purpose - a row exists only where a publisher
 * charges something other than the list price - which is right for storage
 * and wrong for display. A buyer looking at "gambling" wants the number they
 * will pay for each placement, not a gap to interpret, so both shapes below
 * fill in the standard price and say which cells were actually overridden.
 */

export interface RateCardCell {
  linkType: LinkTypeSlug;
  priceMinor: number;
  /** True when the publisher prices this niche differently. */
  override: boolean;
}

export interface RateCardRow {
  /** Null for the standard rate that applies to everything else. */
  niche: string | null;
  cells: RateCardCell[];
}

/** The placements a site actually sells at a price, in a stable order. */
const TYPE_ORDER: LinkTypeSlug[] = ['guest-post', 'niche-edit', 'digital-pr'];

export function pricedServices(website: Pick<Website, 'services'>) {
  return website.services
    .filter((service) => service.available && service.priceMinor > 0)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
}

/**
 * A full grid: the standard row, then one row per niche that is priced
 * differently, dearest first.
 *
 * A niche row carries a price for every placement on sale, falling back to the
 * standard one where the publisher did not set a premium. That fallback is
 * the truth - no override means the list price applies - and printing it beats
 * printing a dash the reader has to decode.
 */
export function rateCard(
  website: Pick<Website, 'services' | 'nichePrices'>,
): { placements: LinkTypeSlug[]; rows: RateCardRow[] } {
  const services = pricedServices(website);
  const placements = services.map((service) => service.type);
  const standard = new Map(services.map((service) => [service.type, service.priceMinor]));

  const byNiche = new Map<string, Map<LinkTypeSlug, number>>();
  for (const price of website.nichePrices) {
    if (price.priceMinor <= 0 || !standard.has(price.linkType)) continue;
    const existing = byNiche.get(price.niche) ?? new Map<LinkTypeSlug, number>();
    existing.set(price.linkType, price.priceMinor);
    byNiche.set(price.niche, existing);
  }

  const rows: RateCardRow[] = [...byNiche.entries()]
    .map(([niche, overrides]) => ({
      niche,
      cells: placements.map((linkType) => ({
        linkType,
        priceMinor: overrides.get(linkType) ?? standard.get(linkType)!,
        override: overrides.has(linkType),
      })),
    }))
    .sort((a, b) => topPrice(b) - topPrice(a));

  if (placements.length === 0) return { placements, rows: [] };

  return {
    placements,
    rows: [
      {
        niche: null,
        cells: placements.map((linkType) => ({
          linkType,
          priceMinor: standard.get(linkType)!,
          override: false,
        })),
      },
      ...rows,
    ],
  };
}

function topPrice(row: RateCardRow): number {
  return Math.max(...row.cells.map((cell) => cell.priceMinor));
}

/**
 * The overrides for one placement, dearest first.
 *
 * What the order card needs: someone choosing a guest post is owed the guest
 * post premiums and nothing about niche edits.
 */
export function overridesForType(
  prices: NichePrice[],
  linkType: LinkTypeSlug,
): NichePrice[] {
  return prices
    .filter((price) => price.linkType === linkType && price.priceMinor > 0)
    .sort((a, b) => b.priceMinor - a.priceMinor);
}

/** Overrides gathered per niche, dearest niche first. */
export function groupNichePrices(prices: NichePrice[]) {
  const groups = new Map<string, NichePrice[]>();

  for (const price of prices) {
    if (price.priceMinor <= 0) continue;
    const existing = groups.get(price.niche);
    if (existing) existing.push(price);
    else groups.set(price.niche, [price]);
  }

  return [...groups.entries()]
    .map(([niche, group]) => ({
      niche,
      prices: [...group].sort((a, b) => b.priceMinor - a.priceMinor),
      top: Math.max(...group.map((price) => price.priceMinor)),
    }))
    .sort((a, b) => b.top - a.top);
}
