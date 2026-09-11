export type CountryCode =
  | 'GB'
  | 'US'
  | 'CA'
  | 'AU'
  | 'IE'
  | 'DE'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'NL'
  | 'SE'
  | 'PT'
  | 'NZ';

export interface Country {
  code: CountryCode;
  name: string;
  /** Short label used in compact table cells. */
  shortName: string;
  region: 'UK' | 'North America' | 'Europe' | 'Oceania';
}
