import type { NicheSlug } from '@/lib/types';

/**
 * Majestic's Topical Trust Flow, read as a hint about our own categories.
 *
 * The first thing to be clear about, because everything here depends on it:
 * a Topical Trust Flow topic describes *who links to a site*, not what the
 * site publishes. Of nine hundred and ten domains measured, thirty-seven led
 * with `Games/Gambling` - against hundreds that a publisher has told us in
 * writing they will run gambling content on. A buyer filtering for gambling
 * wants the second set.
 *
 * So this never decides anything. `acceptedNiches` says what a publisher will
 * take, and that comes from their own email. `niche` says what a site is
 * about, and a human sets it. This produces a suggestion for the second,
 * which somebody accepts or ignores - useful because the nine hundred
 * listings sourced from email all carry whatever the importer defaulted to,
 * which is to say no category at all.
 *
 * Majestic's taxonomy has around eight hundred topics and two hundred and
 * eighty-eight turned up in one export of nine hundred domains. That is why
 * this maps rather than replaces: a filter with two hundred and eighty-eight
 * entries is not a filter.
 */

/**
 * Longest prefix wins.
 *
 * `Business/Financial Services` is finance, `Business/Energy` is science and
 * environment, and a bare `Business` is business. Matching the most specific
 * rule first is what lets the general one stay general.
 *
 * Measured against a real export of 910 topics: 683 match here, and another
 * 137 match once News, Science and Education have categories of their own.
 * The rest are mostly `Regional/*`, which is geography and deliberately
 * unmapped - forcing "Europe" into a topic would be inventing one.
 */
const RULES: Record<string, NicheSlug> = {
  // Gambling. Majestic files it under both, depending on the era of the data.
  'Games/Gambling': 'igaming',
  'Recreation/Gambling': 'igaming',

  // Money. More specific than the `Business` fallback below it.
  'Business/Financial Services': 'finance',
  'Business/Investing': 'finance',
  'Business/Accounting': 'finance',
  'Business/Financial Services/Banking Services': 'finance',
  'Society/Law/Legal Information': 'business',

  'Computers': 'technology',
  'Science/Technology': 'technology',

  'Business': 'business',
  'Shopping': 'lifestyle',

  'Health': 'health',
  'Recreation/Travel': 'travel',
  'Regional/Travel and Transportation': 'travel',

  'Recreation/Food': 'food',
  'Home/Cooking': 'food',
  'Shopping/Food': 'food',

  'Recreation/Autos': 'automotive',
  'Recreation/Motorcycles': 'automotive',
  'Sports/Motorsports': 'automotive',

  'Home': 'home-garden',
  'Recreation/Outdoors': 'home-garden',

  'Sports': 'sports',

  'Arts': 'entertainment',
  'Games': 'entertainment',
  'Recreation': 'lifestyle',
  'Society': 'lifestyle',

  // The three added from the inventory.
  'News': 'news-media',
  'Arts/Media': 'news-media',
  'Business/News and Media': 'news-media',

  'Science': 'science-environment',
  'Science/Environment': 'science-environment',
  'Science/Agriculture': 'science-environment',
  'Business/Energy': 'science-environment',
  'Business/Agriculture and Forestry': 'science-environment',

  'Reference': 'education',
  'Science/Educational Resources': 'education',
  'Business/Education and Training': 'education',
};

/**
 * Our category for one Majestic topic, or null when there is no honest one.
 *
 * Null is a real answer and the common case for `Regional/*` and `Adult/*`.
 * A category picked because it was the least wrong is worse than none: it
 * puts a listing in a filter its buyer did not want it in.
 */
export function nicheFromTopic(topic: string): NicheSlug | null {
  const parts = topic.trim().split('/');
  for (let depth = parts.length; depth > 0; depth -= 1) {
    const match = RULES[parts.slice(0, depth).join('/')];
    if (match) return match;
  }
  return null;
}

export interface TopicReading {
  topic: string;
  /** 0-100, Majestic's trust flow attributed to that topic. */
  value: number;
}

/**
 * What to suggest for a listing, given its top topics.
 *
 * The strongest topic that maps to anything, rather than strictly the first:
 * a site whose leading topic is `Regional/Europe` and whose second is
 * `Recreation/Travel` is a travel site, and refusing to look past the first
 * would leave it uncategorised.
 *
 * `null` when none of them maps, which is the honest outcome for a domain
 * whose whole profile is geography.
 */
export function suggestNiche(topics: readonly TopicReading[]): {
  niche: NicheSlug;
  from: TopicReading;
} | null {
  for (const reading of topics) {
    const niche = nicheFromTopic(reading.topic);
    if (niche) return { niche, from: reading };
  }
  return null;
}
