/**
 * Cost in, price out.
 *
 * Deliberately pure: no database, no network, no clock. Every commercial
 * decision arrives as an argument, so the whole of pricing can be tested by
 * calling a function - which matters more here than anywhere else in the
 * codebase, because a rounding rule that is subtly wrong does not throw. It
 * quietly sells three hundred placements at the wrong price.
 *
 * Money is integer minor units throughout. Percentages are the only floats,
 * and they are applied and rounded immediately.
 */

export interface PricingRules {
  fxBufferPct: number;
  paypalFeePct: number;
  paypalFeeFixedMinor: number;
  cryptoFeePct: number;
  bankFeePct: number;
  bankFeeFixedMinor: number;
  vatReclaimable: boolean;
  minMarginMinor: number;
  agencyDiscountPoints: number;
}

export interface MarkupBand {
  minCostMinor: number;
  markupPct: number | null;
  flatMinor: number | null;
}

export interface RoundingTier {
  minMinor: number;
  allowedLastDigits: number[];
}

export interface PriceInput {
  /** What the publisher charges, in their currency, minor units. */
  costMinor: number;
  currency: string;
  /** One unit of their currency in GBP. */
  fxRate: number;
  paymentMethods: string[];
  pricesExcludeVat: boolean | null;
  vatRatePct: number | null;
}

export interface PriceBreakdown {
  costMinor: number;
  currency: string;
  fxRate: number;
  fxBufferPct: number;
  /** After conversion and the buffer, before fees and VAT. */
  costGbpMinor: number;
  feeMinor: number;
  feeLabel: string;
  vatMinor: number;
  trueCostMinor: number;
  bandLabel: string;
  markupMinor: number;
  /** Whether the minimum margin, rather than the band, set the markup. */
  minimumApplied: boolean;
  unroundedMinor: number;
  sellMinor: number;
  agencyMinor: number;
  marginMinor: number;
  marginPct: number;
}

/**
 * What it costs us to pay this publisher.
 *
 * The cheapest method they will accept, because that is the one we would use.
 * A publisher who takes PayPal and bank transfer gets paid by bank transfer,
 * and pricing in the PayPal fee would inflate every price on their site.
 */
export function paymentFee(
  amountMinor: number,
  methods: string[],
  rules: PricingRules,
): { feeMinor: number; label: string } {
  const options: { feeMinor: number; label: string }[] = [];

  for (const method of methods) {
    if (method === 'bank' || method === 'invoice') {
      options.push({
        feeMinor: Math.round((amountMinor * rules.bankFeePct) / 100) + rules.bankFeeFixedMinor,
        label: method === 'bank' ? 'bank transfer' : 'invoice',
      });
    }
    if (method === 'paypal') {
      options.push({
        feeMinor: Math.round((amountMinor * rules.paypalFeePct) / 100) + rules.paypalFeeFixedMinor,
        label: 'PayPal',
      });
    }
    if (method === 'crypto') {
      options.push({
        feeMinor: Math.round((amountMinor * rules.cryptoFeePct) / 100),
        label: 'crypto',
      });
    }
    // pix, upi and western_union are local rails we have no account for. They
    // are not costed as free: a publisher who takes only those has to be paid
    // some other way, and pricing them at zero would understate every price.
  }

  if (options.length === 0) {
    return {
      feeMinor: Math.round((amountMinor * rules.paypalFeePct) / 100) + rules.paypalFeeFixedMinor,
      label: 'no method stated, assumed PayPal',
    };
  }

  return options.reduce((cheapest, option) =>
    option.feeMinor < cheapest.feeMinor ? option : cheapest,
  );
}

/** The band a true cost falls in: the last one whose floor it clears. */
export function bandFor(trueCostMinor: number, bands: MarkupBand[]): MarkupBand | null {
  const ordered = [...bands].sort((a, b) => a.minCostMinor - b.minCostMinor);
  let found: MarkupBand | null = null;
  for (const band of ordered) {
    if (trueCostMinor >= band.minCostMinor) found = band;
  }
  return found;
}

/**
 * Up to the next price a buyer reads as a price.
 *
 * Always upward. Rounding down would give back margin the bands just worked
 * out, quietly and on every listing.
 */
export function roundUp(minor: number, tiers: RoundingTier[]): number {
  const ordered = [...tiers].sort((a, b) => a.minMinor - b.minMinor);
  let tier: RoundingTier | null = null;
  for (const candidate of ordered) {
    if (minor >= candidate.minMinor) tier = candidate;
  }
  if (!tier || tier.allowedLastDigits.length === 0) return minor;

  const allowed = new Set(tier.allowedLastDigits);
  // Work in whole pounds: no price point anybody wants ends in pence.
  const pounds = Math.ceil(minor / 100);
  // A bounded search. The gap between allowed endings is at most ten pounds,
  // so this cannot run away even if the digits are configured oddly.
  for (let step = 0; step <= 10; step += 1) {
    if (allowed.has((pounds + step) % 10)) return (pounds + step) * 100;
  }
  return pounds * 100;
}

export function computePrice(
  input: PriceInput,
  rules: PricingRules,
  bands: MarkupBand[],
  rounding: RoundingTier[],
): PriceBreakdown {
  // --- into GBP, with the buffer -------------------------------------------
  const converted = input.costMinor * input.fxRate;
  const costGbpMinor = Math.round(converted * (1 + rules.fxBufferPct / 100));

  // --- what it costs to pay them -------------------------------------------
  const { feeMinor, label: feeLabel } = paymentFee(costGbpMinor, input.paymentMethods, rules);

  // --- their VAT, where it is a real cost to us ----------------------------
  const vatMinor =
    input.pricesExcludeVat && !rules.vatReclaimable && input.vatRatePct
      ? Math.round((costGbpMinor * input.vatRatePct) / 100)
      : 0;

  const trueCostMinor = costGbpMinor + feeMinor + vatMinor;

  // --- markup ---------------------------------------------------------------
  const band = bandFor(trueCostMinor, bands);
  let markupMinor = 0;
  let bandLabel = 'no band';

  if (band?.flatMinor != null) {
    markupMinor = band.flatMinor;
    bandLabel = `flat ${(band.flatMinor / 100).toFixed(0)} pounds`;
  } else if (band?.markupPct != null) {
    markupMinor = Math.round((trueCostMinor * band.markupPct) / 100);
    bandLabel = `${band.markupPct}%`;
  }

  // The floor, applied after the percentage rather than instead of it. A 30%
  // markup on a cheap placement can still come to less than the minimum.
  const minimumApplied = markupMinor < rules.minMarginMinor;
  if (minimumApplied) {
    markupMinor = rules.minMarginMinor;
    bandLabel = `${bandLabel}, lifted to the ${(rules.minMarginMinor / 100).toFixed(0)} pound minimum`;
  }

  const unroundedMinor = trueCostMinor + markupMinor;
  const sellMinor = roundUp(unroundedMinor, rounding);

  // --- the agency price -----------------------------------------------------
  // Points off the percentage, not a discount on the price, and the minimum
  // margin still holds underneath it.
  const agencyPct = band?.markupPct != null ? Math.max(0, band.markupPct - rules.agencyDiscountPoints) : null;
  const agencyMarkup =
    agencyPct == null
      ? Math.max(band?.flatMinor ?? 0, rules.minMarginMinor)
      : Math.max(Math.round((trueCostMinor * agencyPct) / 100), rules.minMarginMinor);
  const agencyMinor = roundUp(trueCostMinor + agencyMarkup, rounding);

  const marginMinor = sellMinor - trueCostMinor;

  return {
    costMinor: input.costMinor,
    currency: input.currency,
    fxRate: input.fxRate,
    fxBufferPct: rules.fxBufferPct,
    costGbpMinor,
    feeMinor,
    feeLabel,
    vatMinor,
    trueCostMinor,
    bandLabel,
    markupMinor,
    minimumApplied,
    unroundedMinor,
    sellMinor,
    agencyMinor,
    marginMinor,
    marginPct: trueCostMinor > 0 ? (marginMinor / trueCostMinor) * 100 : 0,
  };
}
