import type { CountryCode } from '@/lib/types';

/**
 * The publishers the /guest-posts animation walks through.
 *
 * **Every one of these is invented.** The domains are deliberately not real
 * sites: `.example` is reserved by RFC 2606 and can never be registered, so
 * nobody can visit one, buy one, or be mistaken for one. The page labels the
 * panel as a demonstration too - but a label is a promise about a screenshot,
 * and a reserved domain is a fact about the data.
 *
 * The figures are plausible rather than copied: a DR in the fifties with
 * mid-five-figure traffic and a four-figure referring domain count is the
 * shape of a real listing in this marketplace, which is the point. An
 * animation selling a DR 92 site for £180 would be teaching visitors to
 * expect something the marketplace does not contain.
 *
 * Real listings live behind an account, and `RedactedPreview` further down
 * the same page shows the genuine inventory with its names withheld. These
 * two are doing different jobs: this one shows how the marketplace behaves,
 * that one shows what is actually in it.
 */

export interface DemoListing {
  id: string;
  domain: string;
  niche: string;
  nicheLabel: string;
  country: CountryCode;
  domainRating: number;
  traffic: number;
  referringDomains: number;
  keywords: number;
  priceMinor: number;
  turnaroundDays: [number, number];
  linkType: 'dofollow' | 'nofollow';
  verified: boolean;
  /** Twelve months of traffic, oldest first. Drawn as the detail sparkline. */
  trend: number[];
  /** Where the readers are. Shares, highest first, and they sum to 100. */
  audience: { country: CountryCode; share: number }[];
}

export const DEMO_LISTINGS: DemoListing[] = [
  {
    id: 'demo-1',
    domain: 'northfieldfinance.example',
    niche: 'finance',
    nicheLabel: 'Finance',
    country: 'GB',
    domainRating: 61,
    traffic: 48200,
    referringDomains: 2140,
    keywords: 11800,
    priceMinor: 32000,
    turnaroundDays: [5, 9],
    linkType: 'dofollow',
    verified: true,
    trend: [31, 33, 32, 36, 38, 37, 41, 44, 43, 46, 47, 48],
    audience: [
      { country: 'GB', share: 58 },
      { country: 'US', share: 19 },
      { country: 'IE', share: 11 },
      { country: 'AU', share: 12 },
    ],
  },
  {
    id: 'demo-2',
    domain: 'theledgerweekly.example',
    niche: 'finance',
    nicheLabel: 'Finance',
    country: 'US',
    domainRating: 54,
    traffic: 36900,
    referringDomains: 1620,
    keywords: 8400,
    priceMinor: 24500,
    turnaroundDays: [4, 7],
    linkType: 'dofollow',
    verified: true,
    trend: [22, 24, 26, 25, 28, 30, 31, 30, 33, 34, 36, 37],
    audience: [
      { country: 'US', share: 64 },
      { country: 'CA', share: 14 },
      { country: 'GB', share: 12 },
      { country: 'DE', share: 10 },
    ],
  },
  {
    id: 'demo-3',
    domain: 'harbourtechreview.example',
    niche: 'technology',
    nicheLabel: 'Technology',
    country: 'GB',
    domainRating: 49,
    traffic: 21400,
    referringDomains: 980,
    keywords: 5200,
    priceMinor: 18000,
    turnaroundDays: [3, 6],
    linkType: 'dofollow',
    verified: false,
    trend: [14, 15, 16, 16, 18, 19, 19, 20, 20, 21, 21, 21],
    audience: [
      { country: 'GB', share: 46 },
      { country: 'US', share: 28 },
      { country: 'NL', share: 14 },
      { country: 'SE', share: 12 },
    ],
  },
  {
    id: 'demo-4',
    domain: 'claybrookhealth.example',
    niche: 'health',
    nicheLabel: 'Health',
    country: 'AU',
    domainRating: 57,
    traffic: 29800,
    referringDomains: 1340,
    keywords: 7100,
    priceMinor: 27500,
    turnaroundDays: [6, 11],
    linkType: 'dofollow',
    verified: true,
    trend: [19, 20, 22, 23, 24, 24, 26, 27, 27, 28, 29, 30],
    audience: [
      { country: 'AU', share: 52 },
      { country: 'NZ', share: 18 },
      { country: 'GB', share: 16 },
      { country: 'US', share: 14 },
    ],
  },
  {
    id: 'demo-5',
    domain: 'wanderlistjournal.example',
    niche: 'travel',
    nicheLabel: 'Travel',
    country: 'ES',
    domainRating: 44,
    traffic: 17600,
    referringDomains: 760,
    keywords: 4300,
    priceMinor: 14000,
    turnaroundDays: [4, 8],
    linkType: 'dofollow',
    verified: false,
    trend: [11, 12, 12, 13, 14, 15, 15, 16, 16, 17, 17, 18],
    audience: [
      { country: 'ES', share: 41 },
      { country: 'GB', share: 24 },
      { country: 'FR', share: 19 },
      { country: 'US', share: 16 },
    ],
  },
];

/** The niche chips the demonstration filters by, in the order they appear. */
export const DEMO_NICHES = [
  { slug: 'all', label: 'All niches' },
  { slug: 'finance', label: 'Finance' },
  { slug: 'technology', label: 'Technology' },
  { slug: 'health', label: 'Health' },
  { slug: 'travel', label: 'Travel' },
] as const;

/** What the demonstration types into the search box, a character at a time. */
export const DEMO_SEARCH_TERM = 'finance';

/** The listing the sequence opens, selects and prices. */
export const DEMO_FEATURED_ID = 'demo-1';

export const demoFeatured = (): DemoListing =>
  DEMO_LISTINGS.find((listing) => listing.id === DEMO_FEATURED_ID) ?? DEMO_LISTINGS[0]!;
