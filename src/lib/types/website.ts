import type { CountryCode } from './country';
import type { NicheSlug } from './category';

/** A slug from `lib/config/accepted-niches`. Kept loose so the list can grow
 * without a type change and without invalidating stored values. */
export type AcceptedNicheSlug = string;

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
  /**
   * What the placement costs us, in minor units.
   *
   * Internal only. It is never sent to a listing page, never included in a
   * customer-facing payload, and is stored in a table a customer cannot read.
   * `undefined` means nobody has recorded a cost yet, which is different from
   * a cost of zero.
   */
  costPriceMinor?: number;
}

/**
 * A price for one niche on one placement type.
 *
 * An override, not a complete rate card: a niche with no entry is not free
 * and not refused, it simply costs what the service costs. Regulated topics
 * are where this earns its keep - the same publisher takes a technology guest
 * post at the list price and wants twice that for gambling.
 */
export interface NichePrice {
  /** A slug from `lib/config/accepted-niches`. */
  niche: AcceptedNicheSlug;
  linkType: LinkTypeSlug;
  priceMinor: number;
}

/** Editorial rules a buyer needs to know before ordering. */
export interface PublishingRules {
  minWordCount: number;
  maxWordCount: number;
  maxLinks: number;
  linkAttribute: LinkAttribute;
  sponsoredTag: SponsoredTagPolicy;
  /**
   * Topics the publisher will take, from the shared list.
   *
   * This is the source of truth. The five booleans below are kept in step with
   * it on every write so that existing filters and listing copy keep working;
   * treat them as a view of this array rather than as separate settings.
   */
  acceptedNiches: AcceptedNicheSlug[];
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
  /**
   * 12 monthly values used to draw the traffic trend sparkline.
   *
   * Empty means no series was supplied - Ahrefs Batch Analysis does not
   * export one - and the sparkline is omitted rather than drawn flat.
   */
  trafficTrend: number[];
  /**
   * Percentage change over the last 6 months.
   *
   * Undefined means nobody measured it. Zero means measured as flat, which is
   * a different statement and is why this cannot simply default to 0.
   */
  trafficChangePct?: number;
  /**
   * Share of traffic coming from the primary country, 0-100.
   *
   * Undefined means not measured. There is no such thing as a real 0 here:
   * the primary country is by definition where most of the audience is.
   */
  topCountryShare?: number;
  /**
   * Audience countries with their traffic share, biggest first.
   *
   * `traffic` is present when the figure came from the Ahrefs refresh, which
   * reports visits per country rather than a percentage. Shares are derived
   * from it, so the two cannot disagree.
   */
  audienceSplit: { country: CountryCode; share: number; traffic?: number }[];
  /** Undefined means not measured. Zero is a real - and good - reading. */
  spamScore?: number;
}

/**
 * How Press Parrot reaches the publisher.
 *
 * Internal only, in the same sense as a service's cost price: it is stored in
 * a table no customer policy matches, it is stripped from every public
 * payload, and it exists so an account manager can fulfil an order without
 * going through somebody's inbox.
 */
export interface PublisherContact {
  email?: string;
  name?: string;
  /** Anything worth knowing before writing to them. Never customer-facing. */
  notes?: string;
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
  /** Price overrides per niche. Empty means the service prices stand. */
  nichePrices: NichePrice[];
  /**
   * Publisher contact details, for admin surfaces only.
   *
   * Undefined on anything a customer can reach - not merely empty, because
   * the public reads never ask for it and the public methods strip it.
   */
  contact?: PublisherContact;
  rules: PublishingRules;
  /** Manually vetted by the in-house editorial team. */
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
