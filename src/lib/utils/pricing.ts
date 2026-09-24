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

/**
 * The topic a buyer declares when none of the priced ones apply.
 *
 * A real slug rather than a blank, so an order records an answer rather than
 * a gap. "Not answered" and "answered: nothing unusual" need to be different
 * things: the first must block checkout, the second must not.
 */
export const GENERAL_TOPIC = 'general';

export interface PlacementPrice {
  /** What to charge this buyer. */
  priceMinor: number;
  /** What it would have cost on the standard rate for the same buyer. */
  listPriceMinor: number;
  /** True when the declared topic carries a premium. */
  premium: boolean;
  /** True when an agency rate was used rather than the standard one. */
  agencyRate: boolean;
}

/**
 * Which buyers get the agency rate.
 *
 * The plan already on the profile, so there is no second notion of who is an
 * agency to drift out of step with the one on the billing page.
 */
export type BuyerTier = 'standard' | 'agency';

export function tierFor(plan: string | undefined): BuyerTier {
  return plan === 'agency' ? 'agency' : 'standard';
}

/** The price for this buyer: the agency one where there is one. */
function forTier(
  standardMinor: number,
  agencyMinor: number | undefined,
  tier: BuyerTier,
): { minor: number; agencyRate: boolean } {
  // Only ever downward. An agency price above the standard one would be a
  // calculation fault, and charging it would be charging a loyal customer
  // more for being one.
  if (tier === 'agency' && agencyMinor != null && agencyMinor > 0 && agencyMinor < standardMinor) {
    return { minor: agencyMinor, agencyRate: true };
  }
  return { minor: standardMinor, agencyRate: false };
}

/**
 * What one placement costs, given the topic it is for.
 *
 * The single answer to that question. The order card, the basket line and
 * `priceBasket` all call this, so the number a buyer is shown and the number
 * they are charged cannot drift apart - they are the same function of the
 * same stored rates.
 *
 * Returns null when the placement is not on sale, which the caller reports as
 * a rejected line rather than charging the list price for something the
 * publisher has withdrawn.
 */
export function placementPrice(
  website: Pick<Website, 'services' | 'nichePrices'>,
  linkType: LinkTypeSlug,
  topic?: string | null,
  tier: BuyerTier = 'standard',
): PlacementPrice | null {
  const service = website.services.find(
    (candidate) => candidate.type === linkType && candidate.available,
  );
  if (!service || service.priceMinor <= 0) return null;

  const standard = forTier(service.priceMinor, service.agencyPriceMinor, tier);

  const override = topic
    ? website.nichePrices.find(
        (price) => price.linkType === linkType && price.niche === topic && price.priceMinor > 0,
      )
    : undefined;

  const chosen = override
    ? forTier(override.priceMinor, override.agencyPriceMinor, tier)
    : standard;

  return {
    priceMinor: chosen.minor,
    // The standard rate for the same buyer, so a basket line comparing the
    // two is comparing like with like rather than an agency niche price
    // against a retail general one.
    listPriceMinor: standard.minor,
    premium: Boolean(override),
    agencyRate: chosen.agencyRate || standard.agencyRate,
  };
}

/**
 * Must this line declare a topic before it can be paid for?
 *
 * Only where the publisher prices this placement differently for something.
 * On the ordinary listing - most of them - no question is asked and the
 * checkout is exactly as it was.
 */
export function needsTopic(
  website: Pick<Website, 'services' | 'nichePrices'>,
  linkType: LinkTypeSlug,
): boolean {
  return overridesForType(website.nichePrices, linkType).length > 0;
}
