import { acceptedNichesFromFlags, legacyAcceptanceFlags } from '@/lib/config/accepted-niches';
import { nicheName } from '@/lib/data/categories';
import { countryName } from '@/lib/data/countries';
import type {
  BlogPost,
  ContentOrder,
  ContentOrderItem,
  CountryCode,
  LanguageCode,
  LinkTypeSlug,
  NicheSlug,
  Order,
  OrderItem,
  PublisherContact,
  Service,
  UserProfile,
  Website,
  WebsiteStatus,
} from '@/lib/types';

/**
 * Row to domain object.
 *
 * The database uses snake_case columns and a join table for categories; the
 * application uses camelCase and a flat `niche` slug. This module is the only
 * place that knows both, which is what keeps the swap from mock to Supabase
 * invisible above the service layer.
 *
 * Every mapper is defensive about nulls. A column added later, or a row
 * written by the SQL editor rather than the app, should render as a sensible
 * default rather than crash a page.
 */

export interface WebsiteRow {
  id: string;
  slug: string;
  domain: string;
  title: string;
  description: string | null;
  overview: string | null;
  primary_category_id: string | null;
  country_code: string;
  language_code: string | null;
  status: WebsiteStatus;
  verified: boolean;
  rating: number | string | null;
  completed_orders: number | null;
  domain_rating: number | null;
  organic_traffic: number | null;
  referring_domains: number | null;
  traffic_trend: number[] | null;
  traffic_change_pct: number | string | null;
  top_country_share: number | null;
  audience_split: { country: string; share: number; traffic?: number }[] | null;
  website_niche_prices?: { niche: string; link_type: LinkTypeSlug; price_minor: number }[] | null;
  /**
   * Only ever present on an admin read. A customer's query does not ask for
   * it, and the table has no policy that would answer if it did.
   */
  website_contacts?:
    | { email: string | null; contact_name: string | null; notes: string | null }
    | { email: string | null; contact_name: string | null; notes: string | null }[]
    | null;
  spam_score: number | null;
  min_word_count: number | null;
  max_word_count: number | null;
  max_links: number | null;
  link_attribute: 'dofollow' | 'nofollow';
  sponsored_tag: 'never' | 'on-request' | 'always';
  accepts_gambling: boolean;
  accepts_finance: boolean;
  accepts_crypto: boolean;
  accepts_cbd: boolean;
  accepts_adult: boolean;
  accepted_niches: string[] | null;
  restricted_niches: string[] | null;
  content_provided_by: string | null;
  guidelines: string[] | null;
  example_placements: { title: string; path: string; publishedAt: string }[] | null;
  created_at: string;
  updated_at: string;
  /** Joined in by the select. */
  services?: ServiceRow[] | null;
  primary_category?: { slug: string } | null;
  website_categories?: { categories: { slug: string } | null }[] | null;
}

export interface ServiceRow {
  id: string;
  website_id: string;
  type: Service['type'];
  price_minor: number;
  turnaround_min_days: number;
  turnaround_max_days: number;
  available: boolean;
  note: string | null;
  /**
   * Joined from `service_costs`, which only an admin can read.
   *
   * Absent on every customer-facing query - the table has no read policy for
   * anyone but an admin, so the join comes back empty rather than the price
   * leaking.
   */
  service_costs?: { cost_price_minor: number } | { cost_price_minor: number }[] | null;
}

/** Columns every website read needs, including the two joins. */
export const WEBSITE_SELECT = `
  *,
  primary_category:categories!websites_primary_category_id_fkey (slug),
  website_categories (categories (slug)),
  services (*),
  website_niche_prices (niche, link_type, price_minor)
`;

/**
 * The same, plus our buy price for each service.
 *
 * Only for queries made with the admin client. A customer-facing query must
 * use `WEBSITE_SELECT`: not because this one would leak - `service_costs` has
 * no policy that matches a customer, so the embed returns nothing - but
 * because asking for data the caller has no business seeing is the kind of
 * thing that stops being harmless the moment a policy is edited.
 */
export const WEBSITE_SELECT_ADMIN = `
  *,
  primary_category:categories!websites_primary_category_id_fkey (slug),
  website_categories (categories (slug)),
  services (*, service_costs (cost_price_minor)),
  website_niche_prices (niche, link_type, price_minor),
  website_contacts (email, contact_name, notes)
`;

/** Null stays undefined: "not measured" must not become a measurement of 0. */
function toOptionalNumber(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The joined contact, if the caller was allowed to read it.
 *
 * PostgREST returns an embedded one-to-one either as an object or as a
 * single-element array, so both shapes are handled. Anything else - including
 * the empty result a non-admin gets - reads as no contact recorded.
 */
function contactFromRow(row: WebsiteRow): PublisherContact | undefined {
  const joined = row.website_contacts;
  const record = Array.isArray(joined) ? joined[0] : joined;
  if (!record) return undefined;

  const contact: PublisherContact = {
    ...(record.email ? { email: record.email } : {}),
    ...(record.contact_name ? { name: record.contact_name } : {}),
    ...(record.notes ? { notes: record.notes } : {}),
  };
  return Object.keys(contact).length ? contact : undefined;
}

export function mapService(row: ServiceRow): Service {
  return {
    id: row.id,
    websiteId: row.website_id,
    type: row.type,
    priceMinor: toNumber(row.price_minor),
    turnaroundMinDays: toNumber(row.turnaround_min_days, 3),
    turnaroundMaxDays: toNumber(row.turnaround_max_days, 7),
    available: row.available ?? true,
    note: row.note ?? undefined,
    costPriceMinor: costFromRow(row),
  };
}

/**
 * The joined cost, if the caller was allowed to read it.
 *
 * PostgREST returns an embedded one-to-one either as an object or as a
 * single-element array depending on how it infers the relationship, so both
 * shapes are handled. Anything else - including the empty result a
 * non-admin gets - reads as "no cost recorded".
 */
function costFromRow(row: ServiceRow): number | undefined {
  const joined = row.service_costs;
  if (!joined) return undefined;
  const record = Array.isArray(joined) ? joined[0] : joined;
  if (!record || typeof record.cost_price_minor !== 'number') return undefined;
  return record.cost_price_minor;
}

export function mapWebsite(row: WebsiteRow): Website {
  const primaryNiche = (row.primary_category?.slug ?? 'technology') as NicheSlug;
  const secondary = (row.website_categories ?? [])
    .map((entry) => entry.categories?.slug)
    .filter((slug): slug is string => Boolean(slug) && slug !== primaryNiche) as NicheSlug[];

  return {
    id: row.id,
    slug: row.slug,
    domain: row.domain,
    title: row.title || row.domain,
    description: row.description ?? '',
    overview: row.overview ?? '',
    niche: primaryNiche,
    secondaryNiches: secondary,
    country: row.country_code as CountryCode,
    language: (row.language_code ?? 'en') as LanguageCode,
    metrics: {
      domainRating: toNumber(row.domain_rating),
      organicTraffic: toNumber(row.organic_traffic),
      referringDomains: toNumber(row.referring_domains),
      trafficTrend: row.traffic_trend ?? [],
      trafficChangePct: toOptionalNumber(row.traffic_change_pct),
      topCountryShare: toOptionalNumber(row.top_country_share),
      audienceSplit: (row.audience_split ?? []).map((entry) => ({
        country: entry.country as CountryCode,
        share: toNumber(entry.share),
        ...(typeof entry.traffic === 'number' ? { traffic: entry.traffic } : {}),
      })),
      spamScore: toOptionalNumber(row.spam_score),
    },
    services: (row.services ?? []).map(mapService),
    ...(contactFromRow(row) ? { contact: contactFromRow(row) } : {}),
    // Biggest first, so the listing leads with the price a buyer in a
    // regulated niche is actually looking for.
    nichePrices: (row.website_niche_prices ?? [])
      .map((entry) => ({
        niche: entry.niche,
        linkType: entry.link_type,
        priceMinor: toNumber(entry.price_minor),
      }))
      .filter((entry) => entry.priceMinor > 0)
      .sort((a, b) => b.priceMinor - a.priceMinor),
    rules: {
      minWordCount: toNumber(row.min_word_count, 800),
      maxWordCount: toNumber(row.max_word_count, 2000),
      maxLinks: toNumber(row.max_links, 1),
      linkAttribute: row.link_attribute ?? 'dofollow',
      sponsoredTag: row.sponsored_tag ?? 'never',
      acceptsGambling: row.accepts_gambling ?? false,
      acceptsFinance: row.accepts_finance ?? false,
      acceptsCrypto: row.accepts_crypto ?? false,
      acceptsCbd: row.accepts_cbd ?? false,
      acceptsAdult: row.accepts_adult ?? false,
      // Rows written before accepted_niches existed have an empty array, so
      // fall back to what the legacy booleans say rather than showing nothing.
      acceptedNiches:
        row.accepted_niches && row.accepted_niches.length > 0
          ? row.accepted_niches
          : acceptedNichesFromFlags({
              acceptsGambling: row.accepts_gambling ?? false,
              acceptsFinance: row.accepts_finance ?? false,
              acceptsCrypto: row.accepts_crypto ?? false,
              acceptsCbd: row.accepts_cbd ?? false,
              acceptsAdult: row.accepts_adult ?? false,
            }),
      restrictedNiches: row.restricted_niches ?? [],
      contentProvidedBy: (row.content_provided_by ?? 'either') as Website['rules']['contentProvidedBy'],
      guidelines: row.guidelines ?? [],
      examplePlacements: row.example_placements ?? [],
    },
    verified: row.verified ?? false,
    status: row.status,
    rating: toNumber(row.rating),
    completedOrders: toNumber(row.completed_orders),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Domain object to a row patch, for writes. Only defined fields are sent. */
export function websiteToRow(patch: Partial<Website>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (value !== undefined) row[key] = value;
  };

  set('slug', patch.slug);
  set('domain', patch.domain);
  set('title', patch.title);
  set('description', patch.description);
  set('overview', patch.overview);
  set('country_code', patch.country);
  set('language_code', patch.language);
  set('status', patch.status);
  set('verified', patch.verified);
  set('rating', patch.rating);
  set('completed_orders', patch.completedOrders);

  if (patch.metrics) {
    set('domain_rating', patch.metrics.domainRating);
    set('organic_traffic', patch.metrics.organicTraffic);
    set('referring_domains', patch.metrics.referringDomains);
    set('traffic_trend', patch.metrics.trafficTrend);
    // `set` skips undefined, which would make an unset metric unclearable.
    // These three are written explicitly so blanking one in the admin stores
    // a null rather than silently keeping the previous number.
    row.traffic_change_pct = patch.metrics.trafficChangePct ?? null;
    row.top_country_share = patch.metrics.topCountryShare ?? null;
    set('audience_split', patch.metrics.audienceSplit);
    row.spam_score = patch.metrics.spamScore ?? null;
  }

  if (patch.rules) {
    // The list is the source of truth; the booleans are derived from it on
    // every write so the two cannot drift apart.
    if (patch.rules.acceptedNiches) {
      set('accepted_niches', patch.rules.acceptedNiches);
      const flags = legacyAcceptanceFlags(patch.rules.acceptedNiches);
      set('accepts_gambling', flags.acceptsGambling);
      set('accepts_finance', flags.acceptsFinance);
      set('accepts_crypto', flags.acceptsCrypto);
      set('accepts_cbd', flags.acceptsCbd);
      set('accepts_adult', flags.acceptsAdult);
    } else {
      set('accepts_gambling', patch.rules.acceptsGambling);
      set('accepts_finance', patch.rules.acceptsFinance);
      set('accepts_crypto', patch.rules.acceptsCrypto);
      set('accepts_cbd', patch.rules.acceptsCbd);
      set('accepts_adult', patch.rules.acceptsAdult);
    }

    set('min_word_count', patch.rules.minWordCount);
    set('max_word_count', patch.rules.maxWordCount);
    set('max_links', patch.rules.maxLinks);
    set('link_attribute', patch.rules.linkAttribute);
    set('sponsored_tag', patch.rules.sponsoredTag);
    set('restricted_niches', patch.rules.restrictedNiches);
    set('content_provided_by', patch.rules.contentProvidedBy);
    set('guidelines', patch.rules.guidelines);
    set('example_placements', patch.rules.examplePlacements);
  }

  return row;
}

// ------------------------------------------------------------------ profiles

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  role: 'customer' | 'admin';
  plan: string | null;
  created_at: string;
  updated_at: string;
}

export function mapProfile(row: ProfileRow): UserProfile {
  const name = row.full_name || row.email.split('@')[0] || 'Account';
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase() || row.email.charAt(0).toUpperCase();

  return {
    id: row.id,
    email: row.email,
    fullName: name,
    company: row.company ?? undefined,
    role: row.role,
    avatarInitials: initials,
    plan: (row.plan ?? 'starter') as UserProfile['plan'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// -------------------------------------------------------------------- orders

export interface OrderItemRow {
  id: string;
  order_id: string;
  website_id: string | null;
  website_domain: string;
  website_slug: string;
  service_type: OrderItem['serviceType'];
  price_minor: number;
  target_url: string | null;
  anchor_text: string | null;
  preferred_landing_page: string | null;
  notes: string | null;
  article_file_name: string | null;
  article_file_size: number | null;
  live_url: string | null;
  status: Order['status'];
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  reference: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: Order['status'];
  total_minor: number;
  currency: Order['currency'];
  placed_at: string;
  updated_at: string;
  expected_live_at: string | null;
  order_items?: OrderItemRow[] | null;
}

export function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    customerName: row.customer_name ?? '',
    customerEmail: row.customer_email ?? '',
    status: row.status,
    totalMinor: toNumber(row.total_minor),
    currency: row.currency ?? 'GBP',
    items: (row.order_items ?? []).map(
      (item): OrderItem => ({
        id: item.id,
        orderId: item.order_id,
        websiteId: item.website_id ?? '',
        websiteDomain: item.website_domain,
        websiteSlug: item.website_slug,
        serviceType: item.service_type,
        priceMinor: toNumber(item.price_minor),
        targetUrl: item.target_url ?? '',
        anchorText: item.anchor_text ?? '',
        preferredLandingPage: item.preferred_landing_page ?? undefined,
        notes: item.notes ?? undefined,
        articleFileName: item.article_file_name ?? undefined,
        articleFileSize: item.article_file_size ?? undefined,
        liveUrl: item.live_url ?? undefined,
        status: item.status,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      }),
    ),
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
    expectedLiveAt: row.expected_live_at ?? undefined,
  };
}

// ------------------------------------------------------------ content orders

export interface ContentItemRow {
  id: string;
  order_id: string;
  reference: string;
  brief: ContentOrderItem['brief'];
  status: ContentOrderItem['status'];
  price_minor: number;
  writer_name: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  content_revisions?: { id: string; notes: string; requested_at: string; resolved_at: string | null }[] | null;
  content_messages?:
    | { id: string; author_role: 'customer' | 'team'; author_name: string; body: string; created_at: string }[]
    | null;
  content_deliveries?:
    | { id: string; kind: 'draft' | 'final'; file_name: string; body: string | null; delivered_at: string }[]
    | null;
}

export interface ContentOrderRow {
  id: string;
  reference: string;
  user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  status: ContentOrder['status'];
  total_minor: number;
  currency: ContentOrder['currency'];
  placed_at: string;
  updated_at: string;
  content_order_items?: ContentItemRow[] | null;
}

export function mapContentItem(row: ContentItemRow): ContentOrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    reference: row.reference,
    brief: row.brief,
    status: row.status,
    priceMinor: toNumber(row.price_minor),
    writerName: row.writer_name ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    revisions: (row.content_revisions ?? []).map((entry) => ({
      id: entry.id,
      notes: entry.notes,
      requestedAt: entry.requested_at,
      resolvedAt: entry.resolved_at ?? undefined,
    })),
    messages: (row.content_messages ?? [])
      .map((entry) => ({
        id: entry.id,
        authorRole: entry.author_role,
        authorName: entry.author_name,
        body: entry.body,
        createdAt: entry.created_at,
      }))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    deliveries: (row.content_deliveries ?? [])
      .map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        fileName: entry.file_name,
        body: entry.body ?? undefined,
        deliveredAt: entry.delivered_at,
      }))
      .sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapContentOrder(row: ContentOrderRow): ContentOrder {
  return {
    id: row.id,
    reference: row.reference,
    userId: row.user_id,
    customerName: row.customer_name ?? '',
    customerEmail: row.customer_email ?? '',
    status: row.status,
    totalMinor: toNumber(row.total_minor),
    currency: row.currency ?? 'GBP',
    items: (row.content_order_items ?? []).map(mapContentItem),
    placedAt: row.placed_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------- blog

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string;
  status: BlogPost['status'];
  author: string | null;
  cover_image_src: string | null;
  cover_image_alt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export function mapPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? '',
    body: row.body ?? '',
    category: row.category as BlogPost['category'],
    status: row.status,
    author: row.author ?? '',
    coverImage: row.cover_image_src
      ? { src: row.cover_image_src, alt: row.cover_image_alt ?? '' }
      : undefined,
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? undefined,
  };
}

export function postToRow(post: Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body,
    category: post.category,
    status: post.status,
    author: post.author,
    cover_image_src: post.coverImage?.src ?? null,
    cover_image_alt: post.coverImage?.alt ?? null,
    seo_title: post.seoTitle ?? null,
    seo_description: post.seoDescription ?? null,
    published_at: post.publishedAt,
    updated_by: post.updatedBy ?? null,
  };
}

/** Used by the seed script's console output. */
export function describeWebsite(website: Website): string {
  return `${website.domain} (${nicheName(website.niche)}, ${countryName(website.country)})`;
}
