import { slugifyDomain } from '@/lib/utils/format';
import type { ImportFieldKey } from './fields';
import type { RowValues } from './types';
import type { LinkTypeSlug, Service, Website } from '@/lib/types';

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
  const metricKeys: ImportFieldKey[] = ['domain_rating', 'organic_traffic', 'referring_domains'];
  if (metricKeys.some(has)) {
    patch.metrics = {
      ...(existing?.metrics ?? emptyMetrics()),
      ...(has('domain_rating') ? { domainRating: values.domain_rating! } : {}),
      ...(has('organic_traffic') ? { organicTraffic: values.organic_traffic! } : {}),
      ...(has('referring_domains') ? { referringDomains: values.referring_domains! } : {}),
    };
  }

  // --------------------------------------------------------------- services
  const priceKeys: ImportFieldKey[] = [
    'guest_post_price',
    'niche_edit_price',
    'digital_pr_price',
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

  return patch;
}

/** Map free-text accepted topics onto the model's regulated-topic flags. */
function acceptedTopics(entries: string[]) {
  const joined = entries.join(' ').toLowerCase();
  return {
    acceptsGambling: /gambl|casino|betting|igaming/.test(joined),
    acceptsFinance: /financ|money|invest|loan/.test(joined),
    acceptsCrypto: /crypto|blockchain|web3|bitcoin/.test(joined),
    acceptsCbd: /cbd|cannabis|hemp/.test(joined),
    acceptsAdult: false,
  };
}

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

    services.push({
      id: previous?.id ?? `${websiteId}_svc_${definition.type}`,
      websiteId,
      type: definition.type,
      priceMinor: Math.round(amount * 100),
      turnaroundMinDays: Math.max(1, definition.offset < 0 ? min : min + definition.offset),
      turnaroundMaxDays: Math.max(1, max + definition.offset),
      available: previous?.available ?? true,
      note: previous?.note,
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
    trafficChangePct: 0,
    topCountryShare: 0,
    audienceSplit: [],
    spamScore: 0,
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
    rules: emptyRules(),
    verified: false,
    status: 'draft',
    rating: 0,
    completedOrders: 0,
  };
}
