import type { CountryCode, CountrySource } from './country';
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
  /**
   * What an agency account pays. Undefined where nothing has been calculated
   * yet, and then everyone pays `priceMinor`.
   */
  agencyPriceMinor?: number;
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
  /**
   * The currency `costPriceMinor` is quoted in, e.g. 'USD'.
   *
   * It travels with the number on purpose. The currency is stored once, on
   * `website_commercials`, and a cost read without joining it is just an
   * integer that looks like pounds - which is how $109 came to be displayed
   * as £109, and subtracted from a sterling sell price to produce a profit
   * that was never real. Every reader of a cost now has its unit in hand and
   * cannot silently assume.
   *
   * `undefined` means no currency has been recorded, which is not GBP. It is
   * "we do not know what this publisher charges in".
   */
  costCurrency?: string;
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
  /** What an agency account pays for this niche. */
  agencyPriceMinor?: number;
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
  /*
    ----------------------------------------------------------------- terms

    All five arrived with the publisher-sourcing migration, are written when a
    draft is approved, and until now were read by nothing at all - captured
    from a publisher's own email and then invisible. Every one is optional
    because "the publisher did not say" is a real and common answer, and the
    expanded preview hides a row rather than guessing at it.
  */
  /** Whether the link stays up for good, or only for an agreed term. */
  permanence?: 'permanent' | 'fixed-term';
  /** The agreed term, where there is one. */
  minLiveMonths?: number;
  /** Some publishers switch a link to nofollow after a while. */
  dofollowExpiresAfterMonths?: number;
  /** Does the article appear on the homepage. */
  homepagePlacement?: boolean;
  /** What the publisher will only cover, in their words. A sentence, not a tag. */
  topicRestriction?: string;
}

/** One country's share of a website's organic traffic. */
export interface AudienceCountry {
  country: CountryCode;
  /** Whole per cent of the site's organic traffic. */
  share: number;
  /** Visits, where the refresh reported them. Shares are derived from these. */
  traffic?: number;
}

export interface WebsiteMetrics {
  domainRating: number;
  organicTraffic: number;
  referringDomains: number;
  /**
   * Keywords the site ranks for in the top 100 organic results.
   *
   * Optional, not defaulted: a listing nobody has measured must not render as
   * "ranks for 0 keywords", which is a claim about the publisher rather than
   * about our data. Undefined shows a dash.
   */
  organicKeywords?: number;
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
  audienceSplit: AudienceCountry[];
  /** Undefined means not measured. Zero is a real - and good - reading. */
  spamScore?: number;
  /**
   * Majestic Trust Flow, 0-100.
   *
   * Undefined means nobody has measured it, which is not the same as zero and
   * is why this is optional where the three at the top are not. A card
   * printing "TF 0" for an unmeasured site makes a claim we have not made -
   * the same distinction the costs already keep.
   */
  trustFlow?: number;
  /** Majestic Citation Flow, 0-100. Undefined means unmeasured. */
  citationFlow?: number;
}

/**
 * What links to a site, in Majestic's words.
 *
 * Deliberately not a category. A Topical Trust Flow topic describes the
 * backlink profile, not what the site publishes: of 910 domains measured, 38
 * led with a gambling topic, against the hundreds whose publishers have said
 * in writing that they will run gambling content. It is shown to a buyer as
 * evidence and it suggests a category to an admin; it never sets one.
 */
export interface WebsiteTopic {
  /** Majestic's own path, e.g. "Recreation/Travel". */
  topic: string;
  /** Trust flow attributed to that topic, 0-100. */
  value: number;
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

export interface WebsiteDurability {
  /** Share of links still standing at the end of the window, 0-100. */
  pct: number;
  /** How many placements the figure is drawn from. */
  sample: number;
  /**
   * The window the figure describes: 12, 6 or 3 months.
   *
   * Carried because the widest window the evidence supports is the one used,
   * and "92% after 12 months" drawn from three-month-old links would be a lie
   * told in good faith.
   */
  windowMonths: number;
  updatedAt?: string;
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
  /**
   * The primary category, or null where nobody has set one.
   *
   * Null rather than a default. It was `coalesce(pc.slug, 'technology')` in
   * the view and `?? 'technology'` in the mapper, which sold 1,840 of 12,190
   * active listings - one in seven, none of them carrying any other category
   * - as technology sites. The field beside it has always done this
   * correctly: `country` is null when its source is a default, rather than
   * guessing from the domain.
   *
   * A null niche means no niche filter returns the listing, no niche page
   * lists it and no count includes it. Everything else still finds it.
   */
  niche: NicheSlug | null;
  secondaryNiches: NicheSlug[];
  /**
   * The publisher's primary market, where it is known.
   *
   * Optional because most of the time nobody has said. A publisher list rarely
   * carries a country column and an email never does, and the listing used to
   * be created claiming the United Kingdom regardless - so the whole
   * marketplace said "UK" and filtering for anywhere else found nothing.
   * Undefined means unknown, and unknown displays as unknown.
   */
  country?: CountryCode;
  /**
   * Where the country came from.
   *
   * Recorded because a country with no provenance is how the whole marketplace
   * came to claim the United Kingdom with nobody able to say why. It also
   * decides who may overwrite whom: the Ahrefs refresh measures an audience
   * every night and should correct a country it worked out from a domain
   * suffix, but must never quietly undo one a person chose.
   *
   *   stated   - a person or a publisher's own list said so. Nothing overwrites
   *              this; it is the only answer that came from a human.
   *   measured - the largest share of the Ahrefs traffic breakdown. The best
   *              evidence there is, short of being told.
   *   domain   - the country the domain's own suffix names. A fallback for a
   *              listing with no traffic data yet.
   */
  countrySource?: CountrySource;
  language: LanguageCode;
  metrics: WebsiteMetrics;
  services: Service[];
  /** Price overrides per niche. Empty means the service prices stand. */
  nichePrices: NichePrice[];
  /** Up to three Majestic topics, strongest first. Empty when unmeasured. */
  topics: WebsiteTopic[];
  /** When a Majestic export last wrote to this listing. */
  majesticUpdatedAt?: string;
  /**
   * Publisher contact details, for admin surfaces only.
   *
   * Undefined on anything a customer can reach - not merely empty, because
   * the public reads never ask for it and the public methods strip it.
   */
  contact?: PublisherContact;
  /**
   * The currency this publisher quotes every one of their rates in.
   *
   * The record of it, stored once on `website_commercials`. Each service
   * carries a copy as `Service.costCurrency` so that a cost can never be read
   * without its unit, but this is the one that is written.
   *
   * Undefined means nobody has recorded one. That is not GBP - it is a gap,
   * and pricing refuses to convert across it rather than assuming ours.
   */
  costCurrency?: string;
  rules: PublishingRules;
  /**
   * How well links on this site have held up, where there is enough evidence.
   *
   * Undefined means no score, which is not a bad score: a listing nobody has
   * bought from yet, or one with fewer placements than the sample floor, has
   * nothing to report and says so. A zero here would read as "every link was
   * lost", which is a different and much worse claim.
   *
   * Read from columns written nightly by `recompute_durability_scores`. Never
   * computed per card: the marketplace renders hundreds at once.
   */
  durability?: WebsiteDurability;
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
