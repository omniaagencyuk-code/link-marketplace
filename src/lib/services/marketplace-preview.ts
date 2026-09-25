import { currencySymbol } from '@/lib/utils/format';
import type { NicheSlug, WebsiteListItem } from '@/lib/types';

/**
 * Redacted marketplace preview.
 *
 * The publisher inventory is the thing an account buys access to, so no public
 * page may reveal it. This module is the boundary: it takes real listings and
 * returns rows that carry *only* the shape of the marketplace - metrics,
 * price bands, niche, country, a masked domain - and never a domain, slug or
 * id. Public pages import `PreviewRow` and cannot obtain anything else,
 * because the identifying fields are dropped here on the server before the
 * payload is ever serialised into the page.
 *
 * Anything added to `PreviewRow` in future must survive the same question:
 * could a determined reader use it to identify the site? A masked label plus a
 * public TLD cannot; a masked label plus an exact traffic figure and an exact
 * price eventually could, so both are banded.
 */

export interface PreviewRow {
  /** Stable key for React. Random per request - not derived from the record. */
  key: string;
  /** e.g. "••••••••.com" - the TLD only, which identifies nothing. */
  maskedDomain: string;
  niche: NicheSlug;
  country: string;
  /** Rounded to the nearest 5 so an exact DR cannot be matched against a tool. */
  domainRating: number;
  /** Banded, e.g. "210K" from anything in the 200-220K range. */
  traffic: string;
  /** Banded price label, e.g. "£200-300". */
  priceBand: string;
  linkTypes: string[];
}

export interface MarketplacePreview {
  rows: PreviewRow[];
  /** Counts used to describe the marketplace without listing it. */
  totalWebsites: number;
  totalNiches: number;
  totalCountries: number;
}

/** Public suffixes worth showing. Anything else is grouped under a generic. */
const PREVIEW_TLDS = ['.com', '.co.uk', '.net', '.org', '.io', '.de', '.fr', '.es', '.com.au'];

function maskDomain(domain: string, index: number): string {
  const suffix = PREVIEW_TLDS.find((tld) => domain.toLowerCase().endsWith(tld));
  // Length varies a little so the column does not look machine-generated,
  // but it is derived from the row's position, not the real domain length.
  const width = 7 + (index % 3);
  return `${'•'.repeat(width)}${suffix ?? '.com'}`;
}

function bandTraffic(value: number): string {
  if (value >= 1_000_000) return `${(Math.round(value / 100_000) / 10).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000 / 10) * 10}K`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${Math.round(value / 100) * 100}`;
}

/**
 * A price rounded into a hundred-wide band.
 *
 * The symbol comes from the marketplace currency rather than a default
 * argument nobody passed: it said £ while every other price on the page said
 * $, which on the one page shown to signed-out visitors is the worst place
 * for the two to disagree.
 */
function bandPrice(minor: number, symbol = currencySymbol()): string {
  const units = minor / 100;
  if (units < 100) return `${symbol}50-100`;
  const lower = Math.floor(units / 100) * 100;
  return `${symbol}${lower}-${lower + 100}`;
}

/**
 * Build the preview from real listings.
 *
 * Callers pass listings straight from the data layer; everything identifying
 * is dropped here rather than in the component, so a component cannot be
 * changed later in a way that leaks a domain.
 */
export function toPreviewRows(websites: WebsiteListItem[], limit = 6): PreviewRow[] {
  return websites.slice(0, limit).map((website, index) => ({
    key: `preview-${index}`,
    maskedDomain: maskDomain(website.domain, index),
    niche: website.niche,
    country: website.country,
    domainRating: Math.round(website.metrics.domainRating / 5) * 5,
    traffic: bandTraffic(website.metrics.organicTraffic),
    priceBand: bandPrice(website.lowestPriceMinor),
    linkTypes: website.availableLinkTypes.slice(0, 2),
  }));
}
