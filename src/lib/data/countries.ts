import type { Country, CountryCode, CountrySource } from '@/lib/types';

export const countries: Country[] = [
  { code: 'GB', name: 'United Kingdom', shortName: 'UK', region: 'UK' },
  { code: 'US', name: 'United States', shortName: 'US', region: 'North America' },
  { code: 'CA', name: 'Canada', shortName: 'CA', region: 'North America' },
  { code: 'AU', name: 'Australia', shortName: 'AU', region: 'Oceania' },
  { code: 'NZ', name: 'New Zealand', shortName: 'NZ', region: 'Oceania' },
  { code: 'IE', name: 'Ireland', shortName: 'IE', region: 'Europe' },
  { code: 'DE', name: 'Germany', shortName: 'DE', region: 'Europe' },
  { code: 'FR', name: 'France', shortName: 'FR', region: 'Europe' },
  { code: 'ES', name: 'Spain', shortName: 'ES', region: 'Europe' },
  { code: 'IT', name: 'Italy', shortName: 'IT', region: 'Europe' },
  { code: 'NL', name: 'Netherlands', shortName: 'NL', region: 'Europe' },
  { code: 'SE', name: 'Sweden', shortName: 'SE', region: 'Europe' },
  { code: 'PT', name: 'Portugal', shortName: 'PT', region: 'Europe' },
];

export const countryByCode = new Map<CountryCode, Country>(
  countries.map((country) => [country.code, country]),
);

/**
 * Countries outside the marketplace's own list still turn up - the Ahrefs
 * traffic breakdown reports whatever it measures. Naming them beats printing a
 * bare code at a reader, so the runtime's own list is the fallback.
 */
const displayNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function countryName(code: CountryCode) {
  const known = countryByCode.get(code)?.name;
  if (known) return known;

  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function countryShortName(code: CountryCode) {
  return countryByCode.get(code)?.shortName ?? code;
}

/**
 * How an unknown country reads.
 *
 * Shared so a table cell, a card and an export all say the same thing. Most
 * listings do not know their market - a publisher list rarely has a country
 * column and an email never does - and the honest answer is a dash, not a
 * country nobody named.
 */
export const COUNTRY_UNKNOWN = '—';

/** A country for display, or a dash when nobody has said. */
export function countryNameOrUnknown(code: CountryCode | undefined) {
  return code ? countryName(code) : COUNTRY_UNKNOWN;
}

/** The compact form, or a dash when nobody has said. */
export function countryShortNameOrUnknown(code: CountryCode | undefined) {
  return code ? countryShortName(code) : COUNTRY_UNKNOWN;
}

/**
 * Where a country came from, in words.
 *
 * Shown on hover in the admin table, because "why does this say UK?" had no
 * answer for the entire marketplace: the country was a default and nothing
 * recorded that it was one.
 */
export function countrySourceLabel(source: CountrySource | undefined) {
  if (source === 'stated') return 'Stated - set by hand or supplied by the publisher';
  if (source === 'measured') return 'Measured - the largest share of the Ahrefs traffic breakdown';
  if (source === 'domain') return "From the domain's own suffix, until traffic is measured";
  if (source === 'default')
    return 'No market - the United Kingdom this listing used to claim by default';
  return 'No market established';
}
