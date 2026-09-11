import type { CountryCode } from './country';
import type { NicheSlug } from './category';

/** The three product types sold on the marketplace. */
export type LinkTypeSlug = 'guest-post' | 'niche-edit' | 'digital-pr';

export type WebsiteStatus = 'draft' | 'active' | 'paused' | 'archived';

export type LinkAttribute = 'dofollow' | 'nofollow';

export type SponsoredTagPolicy = 'never' | 'on-request' | 'always';

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pt' | 'sv';

/** A purchasable placement on a website. */
export interface Service {
  id: string;
  websiteId: string;
  type: LinkTypeSlug;
  /** Price in minor units (pence) to avoid floating point rounding. */
  priceMinor: number;
  /** Turnaround window in business days. */
  turnaroundMinDays: number;
  turnaroundMaxDays: number;
  available: boolean;
  /** Short customer-facing note, e.g. "Includes writing and 2 revisions". */
  note?: string;
}

/** Editorial rules a buyer needs to know before ordering. */
export interface PublishingRules {
  minWordCount: number;
  maxWordCount: number;
  maxLinks: number;
  linkAttribute: LinkAttribute;
  sponsoredTag: SponsoredTagPolicy;
  acceptsGambling: boolean;
  acceptsFinance: boolean;
  acceptsCrypto: boolean;
  acceptsCbd: boolean;
  acceptsAdult: boolean;
  /** Free-form topics the publisher will not accept. */
  restrictedNiches: string[];
  /** Content must be supplied by the buyer, or the publisher writes it. */
  contentProvidedBy: 'buyer' | 'publisher' | 'either';
  guidelines: string[];
  /** Indexed example placements, used on the listing page. */
  examplePlacements: { title: string; path: string; publishedAt: string }[];
}

export interface WebsiteMetrics {
  domainRating: number;
  organicTraffic: number;
  referringDomains: number;
  /** 12 monthly values used to draw the traffic trend sparkline. */
  trafficTrend: number[];
  /** Percentage change over the last 6 months, positive or negative. */
  trafficChangePct: number;
  /** Share of traffic coming from the primary country, 0-100. */
  topCountryShare: number;
  /** Secondary audience countries with their traffic share. */
  audienceSplit: { country: CountryCode; share: number }[];
  spamScore: number;
}

export interface Website {
  id: string;
  /** URL segment, e.g. "casinoguru-co-uk". */
  slug: string;
  domain: string;
  title: string;
  description: string;
  /** Longer editorial overview shown on the listing page. */
  overview: string;
  niche: NicheSlug;
  secondaryNiches: NicheSlug[];
  country: CountryCode;
  language: LanguageCode;
  metrics: WebsiteMetrics;
  services: Service[];
  rules: PublishingRules;
  /** Manually vetted by the LinkMarket editorial team. */
  verified: boolean;
  status: WebsiteStatus;
  /** Average buyer rating 0-5. */
  rating: number;
  completedOrders: number;
  createdAt: string;
  updatedAt: string;
}

/** Derived, denormalised fields used by list views and sorting. */
export interface WebsiteListItem extends Website {
  /**
   * The service shown in list views: guest post where offered, otherwise
   * niche edit, otherwise digital PR. Price, turnaround and the link type
   * badge in the marketplace table all describe this one service, so sorting
   * by price sorts by the number the buyer can actually see.
   */
  headlineService: Service | null;
  headlinePriceMinor: number;
  /** Lowest price across every available service, used for "from" pricing. */
  lowestPriceMinor: number;
  fastestTurnaroundDays: number;
  availableLinkTypes: LinkTypeSlug[];
}
