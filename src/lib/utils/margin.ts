import type { Service, Website } from '@/lib/types';

/**
 * What a placement makes us.
 *
 * Cost is optional everywhere, because "we have not recorded what this costs"
 * is a real and common state that must not be confused with "this costs
 * nothing". Every function here returns null rather than zero when the cost is
 * unknown, so a missing figure shows as "-" in the admin rather than as a
 * flattering 100% margin.
 */

export interface Margin {
  priceMinor: number;
  costMinor: number;
  profitMinor: number;
  /** Profit as a percentage of price, rounded to one decimal. */
  marginPct: number;
}

export function serviceMargin(service: Service): Margin | null {
  if (typeof service.costPriceMinor !== 'number') return null;

  const priceMinor = service.priceMinor;
  const costMinor = service.costPriceMinor;
  const profitMinor = priceMinor - costMinor;

  return {
    priceMinor,
    costMinor,
    profitMinor,
    // A price of zero has no meaningful margin - avoid dividing by it.
    marginPct: priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0,
  };
}

/**
 * The whole site's position, across the services that have a recorded cost.
 *
 * Services with no cost are left out of both sides of the sum rather than
 * counted as free, so the percentage describes only what is actually known.
 */
export function websiteMargin(website: Pick<Website, 'services'>): Margin | null {
  const priced = website.services.filter(
    (service) => typeof service.costPriceMinor === 'number',
  );
  if (priced.length === 0) return null;

  const priceMinor = priced.reduce((total, service) => total + service.priceMinor, 0);
  const costMinor = priced.reduce((total, service) => total + (service.costPriceMinor ?? 0), 0);
  const profitMinor = priceMinor - costMinor;

  return {
    priceMinor,
    costMinor,
    profitMinor,
    marginPct: priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0,
  };
}

/** How many of a site's services still have no cost recorded. */
export function servicesMissingCost(website: Pick<Website, 'services'>): number {
  return website.services.filter((service) => typeof service.costPriceMinor !== 'number').length;
}
