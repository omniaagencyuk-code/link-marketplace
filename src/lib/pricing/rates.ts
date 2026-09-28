import { brand } from '@/lib/config/brand';

/**
 * What the rates panel should say about a currency.
 *
 * Pure, and it exists because this has been got wrong three times in one
 * codebase, always the same way: a screen written while GBP was the base
 * currency, still treating GBP as the base after we moved to USD.
 *
 * The base is fixed at 1 against itself and is never fetched. Every other
 * currency has a real rate, and showing one of them as 1.0000 says the
 * pound and the dollar are worth the same - which is wrong on its face, and
 * worse, reads as a rate rather than as a bug.
 */

export interface RateLike {
  currency: string;
  rateToBase: number | null;
  ageDays: number;
}

/** The rate to show, or null when there genuinely is not one. */
export function displayRate(
  currency: string,
  rateFor: Map<string, number | null>,
  base: string = brand.currency,
): number | null {
  if (currency === base) return 1;
  return rateFor.get(currency) ?? null;
}

/**
 * Rates old enough to be worth a warning.
 *
 * The base is excluded because it is never fetched: its row is written once
 * and stays, so counting it means a "rates are stale, check the cron"
 * warning that is permanently on and therefore permanently ignored - which
 * is worse than no warning, because it trains somebody to scroll past the
 * one that matters.
 */
export function staleRates(
  rates: RateLike[],
  maxAgeDays = 3,
  base: string = brand.currency,
): string[] {
  return rates
    .filter((rate) => rate.currency !== base && rate.ageDays > maxAgeDays)
    .map((rate) => rate.currency);
}
