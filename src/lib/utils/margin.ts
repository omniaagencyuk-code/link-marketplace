import { brand } from '@/lib/config/brand';
import type { Service, Website } from '@/lib/types';

/**
 * What a placement makes us.
 *
 * Cost is optional everywhere, because "we have not recorded what this costs"
 * is a real and common state that must not be confused with "this costs
 * nothing". Every function here returns null rather than zero when the cost is
 * unknown, so a missing figure shows as "-" in the admin rather than as a
 * flattering 100% margin.
 *
 * The same applies, and for a sharper reason, to a cost in another currency.
 * Subtracting $109 from £145 produces a number, and the number is nonsense.
 * A publisher quoting in dollars needs today's rate, the conversion buffer and
 * the payment fee before their cost means anything in sterling, and all three
 * live in the pricing engine. So a cost in a foreign currency is not "a cost
 * we can nearly use" - it is one this file refuses to subtract, and says so.
 */

export interface Margin {
  priceMinor: number;
  costMinor: number;
  profitMinor: number;
  /** Profit as a percentage of price, rounded to one decimal. */
  marginPct: number;
}

/** Why a margin could not be worked out, for a caller that wants to explain. */
export type MarginBlock = 'no-cost' | 'foreign-currency';

/**
 * Whether a cost can be subtracted from a price denominated in `currency`.
 *
 * A cost with no recorded currency is not assumed to be ours. Where the
 * currency is unknown the publisher may be quoting anything, and a margin
 * built on that guess is exactly the figure somebody would act on.
 */
function comparable(service: Service, currency: string): boolean {
  if (typeof service.costPriceMinor !== 'number') return false;
  return (service.costCurrency ?? '').toUpperCase() === currency.toUpperCase();
}

export function serviceMargin(service: Service, currency = brand.currency): Margin | null {
  if (!comparable(service, currency)) return null;

  const priceMinor = service.priceMinor;
  const costMinor = service.costPriceMinor as number;
  const profitMinor = priceMinor - costMinor;

  return {
    priceMinor,
    costMinor,
    profitMinor,
    // A price of zero has no meaningful margin - avoid dividing by it.
    marginPct: priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0,
  };
}

/** Why `serviceMargin` gave nothing back, so a caller can say which it was. */
export function marginBlock(service: Service, currency = brand.currency): MarginBlock | null {
  if (typeof service.costPriceMinor !== 'number') return 'no-cost';
  if (!comparable(service, currency)) return 'foreign-currency';
  return null;
}

/**
 * The whole site's position, across the services whose cost we can actually
 * compare.
 *
 * Services with no cost, or a cost in another currency, are left out of both
 * sides of the sum rather than counted as free or counted at face value, so
 * the percentage describes only what is genuinely known.
 */
export function websiteMargin(
  website: Pick<Website, 'services'>,
  currency = brand.currency,
): Margin | null {
  const priced = website.services.filter((service) => comparable(service, currency));
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

/**
 * How many of a site's services have a cost we cannot compare here.
 *
 * Counted separately from a missing cost because the two need different
 * answers: one is "go and find out what they charge", the other is "this is
 * priced by the engine, go and look there".
 */
export function servicesInForeignCurrency(
  website: Pick<Website, 'services'>,
  currency = brand.currency,
): number {
  return website.services.filter(
    (service) =>
      typeof service.costPriceMinor === 'number' && !comparable(service, currency),
  ).length;
}

/**
 * The site's position in our own money, whatever the publisher charges in.
 *
 * `trueCostByType` comes from `price_calculations`: the publisher's price
 * converted at the stored rate, with the buffer, the payment fee and any VAT
 * they add. It is what the placement actually costs us, so it is the only
 * figure a sterling profit can honestly be worked out against.
 *
 * Only placements with both a sell price and a calculated cost are counted.
 * A service the engine has not priced is left out of both sides rather than
 * counted as free - the same rule the native-currency version follows, for
 * the same reason.
 */
export function websiteMarginConverted(
  website: Pick<Website, 'services'>,
  trueCostByType: Record<string, number> | undefined,
): Margin | null {
  if (!trueCostByType) return null;

  const counted = website.services.filter(
    (service) => typeof trueCostByType[service.type] === 'number',
  );
  if (counted.length === 0) return null;

  const priceMinor = counted.reduce((total, service) => total + service.priceMinor, 0);
  const costMinor = counted.reduce((total, service) => total + trueCostByType[service.type], 0);
  const profitMinor = priceMinor - costMinor;

  return {
    priceMinor,
    costMinor,
    profitMinor,
    marginPct: priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0,
  };
}
