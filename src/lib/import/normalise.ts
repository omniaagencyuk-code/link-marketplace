import { countries } from '@/lib/data/countries';
import { nicheAliases } from './fields';
import { languageLabels } from '@/lib/utils/labels';
import type { CountryCode, LanguageCode, NicheSlug, WebsiteStatus } from '@/lib/types';

/**
 * Value normalisers shared by the importer.
 *
 * Every function is pure and returns `null` when it cannot make sense of the
 * input, so callers decide whether that is an error or a warning.
 */

/**
 * Reduce anything domain-shaped to a bare root domain.
 *
 * "https://www.example.com/article?x=1" -> "example.com"
 * Used for both storage and duplicate detection, so "example.com" and
 * "https://www.example.com/" never import twice.
 */
export function normaliseDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // protocol
  value = value.replace(/^[^@/]*@/, ''); // userinfo
  value = value.split(/[/?#]/)[0] ?? ''; // path, query, fragment
  value = value.split(':')[0] ?? ''; // port
  value = value.replace(/^www\./, '');
  value = value.replace(/\.+$/, ''); // trailing dot

  if (!value) return null;
  return value;
}

/** Conservative hostname check: labels, at least one dot, plausible TLD. */
export function isValidDomain(domain: string): boolean {
  if (domain.length > 253) return false;
  if (!/^[a-z0-9.-]+$/.test(domain)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  if (labels.some((label) => label.length === 0 || label.length > 63)) return false;
  if (labels.some((label) => label.startsWith('-') || label.endsWith('-'))) return false;
  const tld = labels[labels.length - 1] ?? '';
  return /^[a-z]{2,24}$/.test(tld);
}

/**
 * Parse a human-written number.
 *
 * "45,000" -> 45000, "45k" -> 45000, "1.2M" -> 1200000, "2 300" -> 2300
 */
export function parseNumber(input: string): number | null {
  const value = input.trim().toLowerCase().replace(/[\s,_]/g, '');
  if (!value) return null;

  const match = /^(-?\d*\.?\d+)([kmb])?$/.exec(value);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;

  const multiplier = match[2] === 'b' ? 1e9 : match[2] === 'm' ? 1e6 : match[2] === 'k' ? 1e3 : 1;
  return Math.round(amount * multiplier);
}

const currencySymbols: Record<string, string> = {
  '£': 'GBP',
  $: 'USD',
  '€': 'EUR',
};

export interface ParsedPrice {
  /** Whole currency units, e.g. 250 for "£250.00". */
  amount: number;
  /** Detected from a symbol or code in the cell, when present. */
  currency?: string;
}

/** "£250", "$1,250.50", "250 GBP", "250" -> amount plus any detected currency. */
export function parsePrice(input: string): ParsedPrice | null {
  const raw = input.trim();
  if (!raw) return null;

  let currency: string | undefined;
  for (const [symbol, code] of Object.entries(currencySymbols)) {
    if (raw.includes(symbol)) currency = code;
  }
  const codeMatch = /\b(gbp|usd|eur)\b/i.exec(raw);
  if (codeMatch) currency = codeMatch[1]!.toUpperCase();

  const cleaned = raw
    .replace(/[£$€]/g, '')
    .replace(/\b(gbp|usd|eur)\b/gi, '')
    .trim();

  const amount = parseNumber(cleaned);
  if (amount === null || amount < 0) return null;

  return { amount, currency };
}

const truthy = new Set([
  'yes',
  'y',
  'true',
  '1',
  'dofollow',
  'do follow',
  'follow',
  'on',
  'enabled',
]);
const falsy = new Set([
  'no',
  'n',
  'false',
  '0',
  'nofollow',
  'no follow',
  'off',
  'disabled',
  'none',
  'never',
]);

export function parseBoolean(input: string): boolean | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (truthy.has(value)) return true;
  if (falsy.has(value)) return false;
  return null;
}

/** Split a multi-value cell on commas, semicolons or pipes. */
export function parseList(input: string): string[] {
  return input
    .split(/[,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseNiche(input: string): NicheSlug | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!value) return null;
  return nicheAliases[value] ?? nicheAliases[value.replace(/[-_]/g, ' ')] ?? null;
}

const countryLookup = new Map<string, CountryCode>();
for (const country of countries) {
  countryLookup.set(country.code.toLowerCase(), country.code);
  countryLookup.set(country.name.toLowerCase(), country.code);
  countryLookup.set(country.shortName.toLowerCase(), country.code);
}
// Spellings common in publisher lists that are not the official country name.
const extraCountryAliases: Record<string, CountryCode> = {
  uk: 'GB',
  'united kingdom': 'GB',
  'great britain': 'GB',
  england: 'GB',
  britain: 'GB',
  usa: 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  america: 'US',
  'united states of america': 'US',
  deutschland: 'DE',
  germany: 'DE',
  espana: 'ES',
  españa: 'ES',
  italia: 'IT',
  holland: 'NL',
  'the netherlands': 'NL',
};
for (const [alias, code] of Object.entries(extraCountryAliases)) countryLookup.set(alias, code);

export function parseCountry(input: string): CountryCode | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  return countryLookup.get(value) ?? null;
}

const languageLookup = new Map<string, LanguageCode>();
for (const [code, label] of Object.entries(languageLabels)) {
  languageLookup.set(code.toLowerCase(), code as LanguageCode);
  languageLookup.set(label.toLowerCase(), code as LanguageCode);
}

export function parseLanguage(input: string): LanguageCode | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  return languageLookup.get(value) ?? null;
}

const statuses: WebsiteStatus[] = ['draft', 'active', 'paused', 'archived'];
const statusAliases: Record<string, WebsiteStatus> = {
  live: 'active',
  enabled: 'active',
  published: 'active',
  yes: 'active',
  on: 'active',
  disabled: 'paused',
  inactive: 'paused',
  hold: 'paused',
  pending: 'draft',
  new: 'draft',
  no: 'draft',
  deleted: 'archived',
  removed: 'archived',
};

export function parseStatus(input: string): WebsiteStatus | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (statuses.includes(value as WebsiteStatus)) return value as WebsiteStatus;
  return statusAliases[value] ?? null;
}

/** Control characters that must never reach the admin UI or a stored record. */
const controlCharacters = /[\u0000-\u001F\u007F]/g;

/**
 * Strip anything a supplier's CSV should not be able to inject, and cap length.
 * Applied to every free-text cell before it is stored or displayed.
 */
export function sanitiseText(input: string, maxLength = 600): string {
  return input
    .replace(/<[^>]*>/g, '') // no markup from a supplier's CSV
    .replace(controlCharacters, '')
    .trim()
    .slice(0, maxLength);
}
