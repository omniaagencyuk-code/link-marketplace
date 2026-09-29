import { brand } from '@/lib/config/brand';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { linkTypeLabels } from '@/lib/utils/labels';
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
 * What each placement makes us, one line per placement.
 *
 * The site used to be summed: both placements' prices added together, both
 * their costs added together, one profit underneath. It produced a row like
 * "guest post 159, niche edit 159, cost 195.28, profit 122.72" - describing
 * a sale nobody has ever made, because a customer buys one placement or the
 * other and never both.
 *
 * Worse than meaningless, it hid things. A fat margin on a guest post covers
 * a niche edit sold below cost, and the total still reads healthy. The
 * question this table exists to answer is whether every placement makes
 * money, and a sum cannot answer it.
 *
 * The engine's converted cost wins where there is one, for every listing and
 * not only the foreign ones - otherwise a site would change which arithmetic
 * it was shown with depending on where its publisher banks. A placement with
 * no usable cost is left out entirely rather than counted as free.
 */
export interface PlacementMargin {
  type: Service['type'];
  /**
   * The topic this rate is for, or null for the rate that applies to
   * everything else.
   *
   * A gambling guest post and an ordinary guest post are two different things
   * somebody can buy, at two prices, against two costs. Treating them as one
   * placement is how a site came to sell gambling at the general price while
   * paying the publisher their sensitive rate, with a healthy margin showing
   * on the only screen anybody checks.
   */
  niche: string | null;
  priceMinor: number;
  costMinor: number;
  profitMinor: number;
  /** Profit as a percentage of price, rounded to one decimal. */
  marginPct: number;
  /** The engine's converted cost was used rather than the publisher's number. */
  converted: boolean;
  /**
   * No sell price set.
   *
   * Not the same as losing money, and the difference matters: every listing
   * sourced from a publisher's email arrives priced at zero on purpose, and
   * calling three hundred of those "below cost" would bury the handful that
   * really are.
   */
  unpriced: boolean;
}

/**
 * What a listing costs us, by niche and then placement.
 *
 * The general rate is stored under the empty-string key, which is how
 * `price_calculations` records it. A niche with no entry of its own costs
 * what the general rate costs - the publisher quoted one number and it
 * applies to everything they did not price separately.
 */
export type TrueCostIndex = Record<string, Record<string, number>>;

export function placementMargins(
  website: Pick<Website, 'services' | 'nichePrices'>,
  costs?: TrueCostIndex,
  currency = brand.currency,
): PlacementMargin[] {
  const general = costs?.[''];

  /** The cost of one placement for one topic, or null when we cannot say. */
  function costOf(service: Service, niche: string | null) {
    // The niche's own cost where the engine has one, then the general rate -
    // a publisher who never quoted a sensitive price charges their ordinary
    // one for it, which is the same assumption the engine makes.
    const engineCost = (niche ? costs?.[niche]?.[service.type] : undefined) ?? general?.[service.type];
    if (typeof engineCost === 'number') return { costMinor: engineCost, converted: true };
    if (comparable(service, currency)) return { costMinor: service.costPriceMinor as number, converted: false };
    return null;
  }

  function entry(
    service: Service,
    niche: string | null,
    priceMinor: number,
  ): PlacementMargin | null {
    const usable = costOf(service, niche);
    if (!usable) return null;

    const profitMinor = priceMinor - usable.costMinor;
    return {
      type: service.type,
      niche,
      priceMinor,
      costMinor: usable.costMinor,
      profitMinor,
      marginPct: priceMinor > 0 ? Math.round((profitMinor / priceMinor) * 1000) / 10 : 0,
      converted: usable.converted,
      unpriced: priceMinor <= 0,
    };
  }

  const margins: PlacementMargin[] = [];

  for (const service of website.services) {
    const general = entry(service, null, service.priceMinor);
    if (general) margins.push(general);
  }

  /*
    The rate card, one line per topic that differs from the general rate.

    Drawn from both sides, because either can differ on its own:

    - a topic we price differently, which is the ordinary case; and
    - a topic that *costs* differently with no price of its own, which is the
      dangerous one. Approving a publisher's email writes their sensitive rate
      into `website_niche_costs` immediately, and the sell price only appears
      when the engine next runs - so between those two moments the site is on
      sale for gambling at its general price while gambling costs half as much
      again.

    A topic whose price and cost both match the general rate gets no line. It
    would repeat the general margin under a dozen headings and drown the one
    that differs.
  */
  const niches = new Set<string>([
    ...website.nichePrices.filter((price) => price.priceMinor > 0).map((price) => price.niche),
    ...Object.keys(costs ?? {}).filter((niche) => niche !== ''),
  ]);

  for (const niche of niches) {
    for (const service of website.services) {
      const override = website.nichePrices.find(
        (price) =>
          price.niche === niche && price.linkType === service.type && price.priceMinor > 0,
      );

      const nicheCost = costs?.[niche]?.[service.type];
      const differs = Boolean(override) || (nicheCost != null && nicheCost !== general?.[service.type]);
      if (!differs) continue;

      const margin = entry(service, niche, override?.priceMinor ?? service.priceMinor);
      if (margin) margins.push(margin);
    }
  }

  return margins;
}

/**
 * "Gambling Guest Post", or just "Guest Post" for the rate that applies to
 * everything else.
 *
 * Built from the two label registries rather than the slugs, so the words in
 * a tooltip are the words on the rest of the screen. A tooltip reading
 * "gambling guest-post at 4.2%" is a slug leaking into a sentence.
 */
export function placementLabel(margin: PlacementMargin): string {
  const placement = linkTypeLabels[margin.type];
  return margin.niche ? `${acceptedNicheLabel(margin.niche)} ${placement}` : placement;
}

/**
 * The margin on the rate that applies to everything else.
 *
 * Matched on the topic as well as the placement, which is the whole point.
 * Finding by placement alone returns whichever line comes first, and where a
 * listing has no general cost recorded but does have a gambling one, the
 * first line for a guest post *is* the gambling one - so a column showing the
 * general price printed a topic rate's cost and profit beside it. A zero sell
 * price next to a hundred pounds of profit, which is not a rounding error but
 * two different placements read as one.
 */
export function generalMargin(
  margins: PlacementMargin[],
  type: Service['type'],
): PlacementMargin | undefined {
  return margins.find((margin) => margin.type === type && margin.niche === null);
}

/**
 * The thinnest margin on the listing.
 *
 * What belongs in a column somebody scans three hundred rows of: the worst
 * case is the one worth knowing, because the best case is never the one that
 * loses money. Unpriced placements are not candidates - there is no margin on
 * something nobody can buy.
 */
export function worstPlacement(margins: PlacementMargin[]): PlacementMargin | null {
  const priced = margins.filter((margin) => !margin.unpriced);
  if (priced.length === 0) return null;

  return priced.reduce((worst, margin) =>
    margin.marginPct < worst.marginPct ? margin : worst,
  );
}

/**
 * Placements sold at or below what they cost us.
 *
 * The engine cannot produce one: it adds the band's markup, lifts it to the
 * minimum margin and rounds the price up. So these come from a price set by
 * hand, or - the one that matters - from a publisher raising their price
 * after we priced them, which moves the cost and leaves the sell price where
 * it was. Nothing shouts when that happens, which is why it is counted.
 */
export function losingPlacements(margins: PlacementMargin[]): PlacementMargin[] {
  return margins.filter((margin) => !margin.unpriced && margin.profitMinor <= 0);
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
