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
