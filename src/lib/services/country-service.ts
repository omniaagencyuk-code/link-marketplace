import { countries, countryByCode } from '@/lib/data/countries';
import type { Country, CountryCode } from '@/lib/types';

export const countryService = {
  async getAll(): Promise<Country[]> {
    return countries;
  },
  async getByCode(code: CountryCode): Promise<Country | null> {
    return countryByCode.get(code) ?? null;
  },
};
