import { formatPrice } from '@/lib/utils/format';
import type { PriceBreakdown } from './engine';

export interface PriceStep {
  label: string;
  value: string;
}

/**
 * The chain from what the publisher charges to what a buyer pays.
 *
 * One function because two screens show it - the margin report and the
 * listing itself - and a breakdown that explained the same price two
 * different ways would be worth less than no breakdown at all.
 *
 * Every line is a real step the engine took, in the order it took them, so
 * reading down the list is reading the calculation.
 */
export function breakdownSteps(b: PriceBreakdown): PriceStep[] {
  const steps: PriceStep[] = [
    { label: 'Publisher price', value: `${(b.costMinor / 100).toFixed(2)} ${b.currency}` },
  ];

  // A publisher who charges in pounds has no conversion to show, and a line
  // reading "converted at 1.0000" is noise on most of the list.
  if (b.currency !== 'GBP') {
    steps.push({
      label: `Converted at ${b.fxRate.toFixed(4)}, plus ${b.fxBufferPct}% buffer`,
      value: formatPrice(b.costGbpMinor),
    });
  }

  steps.push({ label: `Payment fee (${b.feeLabel})`, value: formatPrice(b.feeMinor) });
  if (b.vatMinor > 0) steps.push({ label: 'Publisher VAT', value: formatPrice(b.vatMinor) });

  steps.push(
    { label: 'True cost', value: formatPrice(b.trueCostMinor) },
    {
      label: b.minimumApplied
        ? `Markup (minimum margin, not ${b.bandLabel})`
        : `Markup (${b.bandLabel})`,
      value: formatPrice(b.markupMinor),
    },
  );

  // Rounding only earns a line when it actually moved the price.
  if (b.sellMinor !== b.unroundedMinor) {
    steps.push({ label: 'Before rounding', value: formatPrice(b.unroundedMinor) });
  }

  steps.push(
    { label: 'Sells at', value: formatPrice(b.sellMinor) },
    { label: 'Agency price', value: formatPrice(b.agencyMinor) },
  );

  return steps;
}
