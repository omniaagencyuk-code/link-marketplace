import { slugifyDomain } from '@/lib/utils/format';
import { legacyAcceptanceFlags, matchAcceptedNiches } from '@/lib/config/accepted-niches';
import { nicheFromPriceFieldKey, type ImportFieldKey } from './fields';
import type { RowValues } from './types';
import type { LinkTypeSlug, NichePrice, Service, Website } from '@/lib/types';

/**
 * Translate normalised CSV values into the existing website model.
 *
 * Only fields the CSV actually supplied are written, which is what lets an
 * update pass leave populated values alone rather than blanking them.
 */
export function toWebsitePatch(
  values: RowValues,
  supplied: ImportFieldKey[],
  existing?: Website,
): Partial<Website> {
  const has = (field: ImportFieldKey) => supplied.includes(field);
  const patch: Partial<Website> = {};

  if (values.domain) {
    patch.domain = values.domain;
    patch.slug = slugifyDomain(values.domain);
  }
  if (has('website_name')) patch.title = values.website_name;
  if (has('description')) patch.description = values.description;
  if (has('primary_niche')) patch.niche = values.primary_niche;
  if (has('secondary_niches')) patch.secondaryNiches = values.secondary_niches;
  if (has('country')) patch.country = values.country;
  if (has('language')) patch.language = values.language;
  if (has('status')) patch.status = values.status;

  // ---------------------------------------------------------------- metrics
  const metricKeys: ImportFieldKey[] = [
    'domain_rating',
    'organic_traffic',
    'referring_domains',
    'top_country_share',
    'traffic_change_pct',
    'spam_score',
  ];
  if (metricKeys.some(has)) {
    patch.metrics = {
      ...(existing?.metrics ?? emptyMetrics()),
      ...(has('domain_rating') ? { domainRating: values.domain_rating! } : {}),
      ...(has('organic_traffic') ? { organicTraffic: values.organic_traffic! } : {}),
      ...(has('referring_domains') ? { referringDomains: values.referring_domains! } : {}),
      // A column absent from the CSV leaves the stored value alone; a column
      // present but blank never reaches here, so re-importing a file without
      // these does not wipe figures entered by hand.
      ...(has('top_country_share') ? { topCountryShare: values.top_country_share! } : {}),
      ...(has('traffic_change_pct') ? { trafficChangePct: values.traffic_change_pct! } : {}),
      ...(has('spam_score') ? { spamScore: values.spam_score! } : {}),
    };
  }

  // --------------------------------------------------------------- services
  const priceKeys: ImportFieldKey[] = [
    'guest_post_price',
    'niche_edit_price',
    'digital_pr_price',
    'guest_post_cost',
    'niche_edit_cost',
    'digital_pr_cost',
    'turnaround_min_days',
    'turnaround_max_days',
  ];
  if (priceKeys.some(has)) {
    patch.services = buildServices(values, supplied, existing);
  }

  // ------------------------------------------------------------------ rules
  const ruleKeys: ImportFieldKey[] = [
    'dofollow',
    'sponsored_tag',
    'minimum_word_count',
    'maximum_links',
    'accepted_niches',
    'restricted_niches',
  ];
  if (ruleKeys.some(has)) {
    const minWords = has('minimum_word_count')
      ? values.minimum_word_count!
      : (existing?.rules.minWordCount ?? 800);
    patch.rules = {
      ...(existing?.rules ?? emptyRules()),
      ...(has('minimum_word_count')
        ? { minWordCount: minWords, maxWordCount: Math.max(minWords + 600, existing?.rules.maxWordCount ?? 0) }
        : {}),
      ...(has('maximum_links') ? { maxLinks: values.maximum_links! } : {}),
      ...(has('dofollow') ? { linkAttribute: values.dofollow ? ('dofollow' as const) : ('nofollow' as const) } : {}),
      ...(has('sponsored_tag')
        ? { sponsoredTag: values.sponsored_tag ? ('always' as const) : ('never' as const) }
        : {}),
      ...(has('restricted_niches') ? { restrictedNiches: values.restricted_niches! } : {}),
      ...(has('accepted_niches') ? acceptedTopics(values.accepted_niches!) : {}),
    };
  }

  // --------------------------------------------------------------- contact
  const contactKeys: ImportFieldKey[] = ['contact_email', 'contact_name', 'contact_notes'];
  if (contactKeys.some(has)) {
    patch.contact = {
      ...(existing?.contact ?? {}),
      ...(has('contact_email') ? { email: values.contact_email } : {}),
      ...(has('contact_name') ? { name: values.contact_name } : {}),
      ...(has('contact_notes') ? { notes: values.contact_notes } : {}),
    };
  }

  // ----------------------------------------------------- prices by niche
  const nichePriceKeys = supplied.filter((key) => nicheFromPriceFieldKey(key));
  if (nichePriceKeys.length > 0) {
    patch.nichePrices = buildNichePrices(values, nichePriceKeys, patch.services ?? existing?.services);
  }

  return patch;
}

/**
 * Niche price columns, attached to the placement the listing quotes.
 *
 * A rate card that says "gambling: 900" means 900 for the thing this site
 * sells, which is a guest post nearly always and a niche edit on the sites
 * that only do those. Rather than assume, this uses the same headline
 * placement the marketplace already prices every row by. A site with nothing
 * for sale gets no overrides - a price for a placement that does not exist
 * would be a price nobody can buy.
 *
 * Replaces the whole set rather than merging: a file that lists niche prices
 * is the rate card, and a premium left off it has been withdrawn.
 */
function buildNichePrices(
  values: RowValues,
  keys: ImportFieldKey[],
  services: Service[] | undefined,
): NichePrice[] {
  const headline =
    services?.find((service) => service.available && service.type === 'guest-post') ??
    services?.find((service) => service.available) ??
    services?.[0];

  if (!headline) return [];

  const prices: NichePrice[] = [];

  for (const key of keys) {
    const niche = nicheFromPriceFieldKey(key);
    if (!niche) continue;

    const major = values[key];
    if (typeof major !== 'number' || !Number.isFinite(major) || major <= 0) continue;

    prices.push({ niche, linkType: headline.type, priceMinor: Math.round(major * 100) });
  }

  return prices;
}

/**
 * Map free-text accepted topics onto the shared niche list.
 *
 * This used to test four regexes against the whole cell joined into one
 * string and set five booleans - so it could tell you a site accepted crypto
 * but not that it accepted anything else, and the list the admin form edits
 * stayed empty after every import. Matching now goes through the same table
 * the rest of the app uses, and the booleans are derived from the result so
 * the two representations cannot disagree.
 */
function acceptedTopics(entries: string[]) {
  const slugs = matchAcceptedNiches(entries);
  return { acceptedNiches: slugs, ...legacyAcceptanceFlags(slugs) };
}

/** The cost column paired with each service type. */
const costKeyByType: Record<LinkTypeSlug, ImportFieldKey> = {
  'guest-post': 'guest_post_cost',
  'niche-edit': 'niche_edit_cost',
  'digital-pr': 'digital_pr_cost',
};

const serviceOrder: { key: ImportFieldKey; type: LinkTypeSlug; offset: number }[] = [
  { key: 'guest_post_price', type: 'guest-post', offset: 0 },
  { key: 'niche_edit_price', type: 'niche-edit', offset: -1 },
  { key: 'digital_pr_price', type: 'digital-pr', offset: 4 },
];

function buildServices(
  values: RowValues,
  supplied: ImportFieldKey[],
  existing?: Website,
): Service[] {
  const has = (field: ImportFieldKey) => supplied.includes(field);
  const websiteId = existing?.id ?? 'pending';
  const fallback = existing?.services[0];

  const min = has('turnaround_min_days')
    ? values.turnaround_min_days!
    : (fallback?.turnaroundMinDays ?? 3);
  const max = has('turnaround_max_days')
    ? values.turnaround_max_days!
    : (fallback?.turnaroundMaxDays ?? Math.max(min + 2, 5));

  const services: Service[] = [];

  for (const definition of serviceOrder) {
    const priceSupplied = has(definition.key);
    const previous = existing?.services.find((service) => service.type === definition.type);

    // No price in the CSV and none on record: the service is not offered.
    if (!priceSupplied && !previous) continue;

    const amount = priceSupplied
      ? (values[definition.key as 'guest_post_price'] as number)
      : (previous!.priceMinor / 100);

    // An explicit zero removes the service.
    if (priceSupplied && amount <= 0) continue;

    // A cost column that was not in the CSV leaves any recorded cost alone,
    // so a price-only update does not wipe the margin data.
    const costKey = costKeyByType[definition.type];
    const costSupplied = has(costKey);
    const costValue = values[costKey as 'guest_post_cost'];
    const costPriceMinor = costSupplied
      ? typeof costValue === 'number'
        ? Math.round(costValue * 100)
        : undefined
      : previous?.costPriceMinor;

    services.push({
      id: previous?.id ?? `${websiteId}_svc_${definition.type}`,
      websiteId,
      type: definition.type,
      priceMinor: Math.round(amount * 100),
      turnaroundMinDays: Math.max(1, definition.offset < 0 ? min : min + definition.offset),
      turnaroundMaxDays: Math.max(1, max + definition.offset),
      available: previous?.available ?? true,
      note: previous?.note,
      costPriceMinor,
    });
  }

  return services;
}

function emptyMetrics(): Website['metrics'] {
  return {
    domainRating: 0,
    organicTraffic: 0,
    referringDomains: 0,
    trafficTrend: [],
    // Left unset rather than zeroed: an import that does not carry these must
    // not publish three measurements nobody took.
    trafficChangePct: undefined,
    topCountryShare: undefined,
    audienceSplit: [],
    spamScore: undefined,
  };
}

function emptyRules(): Website['rules'] {
  return {
    minWordCount: 800,
    maxWordCount: 1600,
    maxLinks: 1,
    linkAttribute: 'dofollow',
    sponsoredTag: 'never',
    acceptsGambling: false,
    acceptsFinance: false,
    acceptsCrypto: false,
    acceptsCbd: false,
    acceptsAdult: false,
    acceptedNiches: [],
    restrictedNiches: [],
    contentProvidedBy: 'either',
    guidelines: [],
    examplePlacements: [],
  };
}

/** Defaults applied to a brand new website, before the CSV patch is layered on. */
export function newWebsiteDefaults(domain: string): Partial<Website> {
  return {
    domain,
    slug: slugifyDomain(domain),
    title: domain,
    description: '',
    overview: '',
    niche: 'business',
    secondaryNiches: [],
    country: 'GB',
    language: 'en',
    metrics: emptyMetrics(),
    services: [],
    nichePrices: [],
    rules: emptyRules(),
    verified: false,
    status: 'draft',
    rating: 0,
    completedOrders: 0,
  };
}
