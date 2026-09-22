import type { Country, CountryCode } from '@/lib/types';

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
