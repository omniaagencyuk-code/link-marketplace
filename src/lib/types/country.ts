/**
 * An ISO 3166-1 alpha-2 country code, uppercase.
 *
 * Not a union of the countries the marketplace curates. A publisher list and
 * an Ahrefs audience breakdown both report whatever country they actually
 * found - `mgdk.dk` is Danish, and a type that could only hold thirteen codes
 * meant storing something false or storing nothing. `countryName` and
 * `countryShortName` name anything the runtime knows, so a code outside the
 * curated list displays properly rather than leaking a raw value.
 */
export type CountryCode = string;

export interface Country {
  code: CountryCode;
  name: string;
  /** Short label used in compact table cells. */
  shortName: string;
  region: 'UK' | 'North America' | 'Europe' | 'Oceania';
}

/**
 * How a listing's country was arrived at, strongest first.
 *
 * The order is the precedence: a refresh may replace a `domain` country with a
 * `measured` one, and neither may touch a `stated` one. `COUNTRY_SOURCES` is
 * the list the database check constraint allows, and the two have to agree.
 *
 * `default` is the weakest and means "believe nothing". It marks the United
 * Kingdom every listing used to claim before the country could be null - kept
 * in the column rather than deleted, so nothing is destroyed, but treated as no
 * country at all: `mapWebsite` does not surface it, so it is not shown, not
 * filtered on, and overwritten by the first real evidence that arrives.
 */
export const COUNTRY_SOURCES = ['stated', 'measured', 'domain', 'default'] as const;

export type CountrySource = (typeof COUNTRY_SOURCES)[number];

/** Whether a new country from `incoming` may replace one already from `held`. */
export function outranksCountrySource(
  incoming: CountrySource,
  held: CountrySource | undefined,
): boolean {
  if (!held) return true;
  return COUNTRY_SOURCES.indexOf(incoming) <= COUNTRY_SOURCES.indexOf(held);
}
