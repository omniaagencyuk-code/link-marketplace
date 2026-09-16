import { acceptedNichesFromFlags } from '@/lib/config/accepted-niches';
import { nicheName } from './categories';
import { countryName } from './countries';
import { rawWebsites, type RawWebsite } from './websites.raw';
import { brand } from '@/lib/config/brand';
import { slugifyDomain } from '@/lib/utils/format';
import { languageLabels } from '@/lib/utils/labels';
import type {
  CountryCode,
  LinkAttribute,
  LinkTypeSlug,
  PublishingRules,
  Service,
  SponsoredTagPolicy,
  Website,
  WebsiteMetrics,
  WebsiteStatus,
} from '@/lib/types';

/** Small deterministic PRNG so the seed data is identical on every render. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, step: number) {
  return Math.round(value / step) * step;
}

/** 12 months of traffic ending at the current value, with a plausible shape. */
function buildTrend(random: () => number, current: number) {
  const drift = 0.55 + random() * 0.85; // where the series started, relative to today
  const points: number[] = [];
  for (let month = 0; month < 12; month += 1) {
    const progress = month / 11;
    const base = current * (drift + (1 - drift) * progress);
    const noise = 1 + (random() - 0.5) * 0.12;
    points.push(Math.max(100, Math.round(base * noise)));
  }
  points[11] = current;
  return points;
}

function buildAudienceSplit(
  random: () => number,
  primary: CountryCode,
): { split: { country: CountryCode; share: number }[]; topShare: number } {
  const neighbours: Record<string, CountryCode[]> = {
    GB: ['IE', 'US', 'AU'],
    US: ['CA', 'GB', 'AU'],
    CA: ['US', 'GB', 'AU'],
    AU: ['NZ', 'GB', 'US'],
    IE: ['GB', 'US', 'CA'],
    DE: ['NL', 'SE', 'GB'],
    NL: ['DE', 'GB', 'FR'],
    SE: ['DE', 'GB', 'US'],
    IT: ['DE', 'FR', 'GB'],
  };
  const topShare = Math.round(58 + random() * 30);
  const rest = 100 - topShare;
  const others = neighbours[primary] ?? ['US', 'GB', 'DE'];
  const a = Math.round(rest * (0.4 + random() * 0.2));
  const b = Math.round((rest - a) * (0.5 + random() * 0.2));
  const c = Math.max(0, rest - a - b);
  return {
    topShare,
    split: [
      { country: primary, share: topShare },
      { country: others[0] as CountryCode, share: a },
      { country: others[1] as CountryCode, share: b },
      { country: others[2] as CountryCode, share: c },
    ].filter((entry) => entry.share > 0),
  };
}

function buildServices(raw: RawWebsite, websiteId: string, random: () => number): Service[] {
  const definitions: { type: LinkTypeSlug; price: number; note: string; offset: number }[] = [
    {
      type: 'guest-post',
      price: raw.gp,
      note: 'Includes professional writing, one round of revisions and permanent placement.',
      offset: 0,
    },
    {
      type: 'niche-edit',
      price: raw.ne,
      note: 'Contextual link inserted into an existing indexed article on the site.',
      offset: -1,
    },
    {
      type: 'digital-pr',
      price: raw.pr,
      note: 'Editorial feature or expert commentary placed with the publication’s newsroom.',
      offset: 4,
    },
  ];

  return definitions
    .filter((definition) => definition.price > 0)
    .map((definition, index) => {
      const min = Math.max(1, raw.tmin + definition.offset);
      const max = Math.max(min + (definition.offset > 0 ? 3 : 0), raw.tmax + definition.offset);
      return {
        id: `${websiteId}_svc_${definition.type}`,
        websiteId,
        type: definition.type,
        priceMinor: definition.price * 100,
        turnaroundMinDays: min,
        turnaroundMaxDays: max,
        available: !(index === 2 && random() < 0.15),
        note: definition.note,
      } satisfies Service;
    });
}

function buildRules(raw: RawWebsite, random: () => number): PublishingRules {
  const restrictedByNiche: Record<string, string[]> = {
    igaming: ['Adult', 'Payday loans'],
    finance: ['Adult', 'Gambling affiliate offers'],
    health: ['Adult', 'Gambling', 'CBD vape'],
    crypto: ['Adult', 'Payday loans'],
    'home-garden': ['Adult', 'Gambling', 'Crypto trading'],
    food: ['Adult', 'Gambling'],
  };

  const attribute: LinkAttribute = random() < 0.86 ? 'dofollow' : 'nofollow';
  const sponsored: SponsoredTagPolicy =
    random() < 0.62 ? 'never' : random() < 0.75 ? 'on-request' : 'always';
  const minWordCount = round(700 + random() * 700, 50);

  const flags = {
    acceptsGambling: raw.n === 'igaming' || (raw.n === 'sports' && random() < 0.7),
    acceptsFinance: raw.n !== 'health' && random() < 0.82,
    acceptsCrypto: raw.n === 'crypto' || (raw.n === 'finance' && random() < 0.7) || random() < 0.35,
    acceptsCbd: raw.n === 'health' ? random() < 0.4 : random() < 0.25,
    acceptsAdult: false,
  };

  return {
    minWordCount,
    maxWordCount: minWordCount + round(600 + random() * 900, 100),
    maxLinks: 1 + Math.floor(random() * 3),
    linkAttribute: attribute,
    sponsoredTag: sponsored,
    ...flags,
    // The seed only knows about the regulated topics, so the list is derived
    // from them plus the site's own niche.
    acceptedNiches: [...new Set(['general', raw.n, ...acceptedNichesFromFlags(flags)])],
    restrictedNiches: restrictedByNiche[raw.n] ?? ['Adult', 'Gambling'],
    contentProvidedBy: random() < 0.55 ? 'either' : random() < 0.6 ? 'buyer' : 'publisher',
    guidelines: [
      `Articles must be original, unpublished and at least ${minWordCount} words.`,
      'Editorial team reviews every submission before scheduling.',
      'Anchor text should read naturally within the paragraph, no exact-match stuffing.',
      'One link to the client site, plus up to two authoritative external references.',
      'No promotional language in the headline or opening paragraph.',
    ],
    examplePlacements: [
      {
        title: `${raw.t} editorial feature`,
        path: `/${slugifyDomain(raw.t)}-feature-${2025 + Math.floor(random() * 2)}`,
        publishedAt: '2026-06-18',
      },
      {
        title: `Buyer guide published for a ${nicheName(raw.n).toLowerCase()} brand`,
        path: `/guides/${raw.n}-buyer-guide`,
        publishedAt: '2026-04-02',
      },
      {
        title: 'Expert commentary round-up',
        path: '/insights/expert-round-up',
        publishedAt: '2026-02-11',
      },
    ],
  };
}

function buildOverview(raw: RawWebsite) {
  const niche = nicheName(raw.n);
  const country = countryName(raw.c);
  const language = languageLabels[raw.l] ?? 'English';
  return [
    `${raw.t} is an independent publication in the ${niche} category, based in ${country} and publishing in ${language}. ${raw.desc}`,
    `The site has been part of the ${brand.name} network since 2024 and is reviewed every quarter by our editorial team. Placements are made inside the main editorial feed rather than a sponsored subfolder, so links sit alongside the publication's organic content and are indexed with the rest of the site.`,
    `Articles are typically ${raw.tmin} to ${raw.tmax} working days from approval to publication. The publisher accepts pre-written content as well as briefs, and all placements are permanent with no yearly renewal fee.`,
  ].join('\n\n');
}

function buildWebsite(raw: RawWebsite, index: number): Website {
  const random = mulberry32(index * 7919 + raw.dr * 31 + raw.d.length);
  const id = `web_${String(index + 1).padStart(3, '0')}`;
  const trend = buildTrend(random, raw.tr);
  const sixMonthsAgo = trend[5] ?? raw.tr;
  const { split, topShare } = buildAudienceSplit(random, raw.c);

  const metrics: WebsiteMetrics = {
    domainRating: raw.dr,
    organicTraffic: raw.tr,
    referringDomains: raw.rd,
    trafficTrend: trend,
    trafficChangePct: Number((((raw.tr - sixMonthsAgo) / sixMonthsAgo) * 100).toFixed(1)),
    topCountryShare: topShare,
    audienceSplit: split,
    spamScore: Math.max(1, Math.round(random() * 6)),
  };

  const statusRoll = random();
  const status: WebsiteStatus =
    statusRoll > 0.96 ? 'paused' : statusRoll > 0.93 ? 'draft' : 'active';

  const createdDayOffset = Math.floor(random() * 640);
  const createdAt = new Date(Date.UTC(2026, 8, 1) - createdDayOffset * 86_400_000).toISOString();
  const updatedAt = new Date(
    Date.UTC(2026, 8, 1) - Math.floor(random() * 40) * 86_400_000,
  ).toISOString();

  return {
    id,
    slug: slugifyDomain(raw.d),
    domain: raw.d,
    title: raw.t,
    description: raw.desc,
    overview: buildOverview(raw),
    niche: raw.n,
    secondaryNiches: raw.s ?? [],
    country: raw.c,
    language: raw.l,
    metrics,
    services: buildServices(raw, id, random),
    rules: buildRules(raw, random),
    verified: random() > 0.12,
    status,
    rating: Number((4.1 + random() * 0.9).toFixed(1)),
    completedOrders: Math.round(18 + random() * 420),
    createdAt,
    updatedAt,
  };
}

/** The full mock marketplace dataset. */
export const websites: Website[] = rawWebsites.map(buildWebsite);

export const websiteById = new Map(websites.map((website) => [website.id, website]));
export const websiteBySlug = new Map(websites.map((website) => [website.slug, website]));

/** Total inventory figure advertised across the marketing site. */
export const ADVERTISED_INVENTORY = 5247;
