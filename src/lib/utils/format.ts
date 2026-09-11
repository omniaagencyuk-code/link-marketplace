import { brand } from '@/lib/config/brand';

const currencySymbols: Record<string, string> = { GBP: '£', USD: '$', EUR: '€' };

/** Format a price held in minor units (pence/cents) as a display string. */
export function formatPrice(
  minor: number,
  options: { currency?: string; locale?: string; withDecimals?: boolean } = {},
) {
  const currency = options.currency ?? brand.currency;
  const locale = options.locale ?? brand.locale;
  const value = minor / 100;
  const hasFraction = value % 1 !== 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: options.withDecimals || hasFraction ? 2 : 0,
    maximumFractionDigits: options.withDecimals || hasFraction ? 2 : 0,
  }).format(value);
}

export function currencySymbol(currency = brand.currency) {
  return currencySymbols[currency] ?? currency;
}

/** 48213 -> "48.2K", 1250000 -> "1.3M" */
export function formatCompactNumber(value: number) {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k >= 100 ? Math.round(k) : Number(k.toFixed(1))}K`;
  }
  const m = value / 1_000_000;
  return `${m >= 100 ? Math.round(m) : Number(m.toFixed(1))}M`;
}

export function formatNumber(value: number, locale = brand.locale) {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(iso: string, locale = brand.locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, locale = brand.locale) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "2 to 3 days" / "5 days" */
export function formatTurnaround(min: number, max: number) {
  if (min === max) return `${min} day${min === 1 ? '' : 's'}`;
  return `${min}-${max} days`;
}

export function formatPercent(value: number, fractionDigits = 0) {
  return `${value > 0 ? '+' : ''}${value.toFixed(fractionDigits)}%`;
}

/** "casinoguru.co.uk" -> "casinoguru-co-uk" */
export function slugifyDomain(domain: string) {
  return domain
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function initialsFromName(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
