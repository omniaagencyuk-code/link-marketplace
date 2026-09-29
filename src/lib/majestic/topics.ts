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
 * Below this, a topic is noise rather than a signal.
 *
 * chelseafotboll.se is the case that set it. A site entirely about Chelsea
 * Football Club, and Majestic's reading of it was: Arts 1, Motorcycles 1,
 * Environment 1, Autos 1. Trust flow of 1 overall - there is barely a
 * backlink profile to describe, so the topics are the rounding error on
 * nothing. It was labelled Entertainment, from `Arts` with a value of one.
 *
 * Across a real export of 910 domains the median topic value is 25 and only
 * 73 fall below five, so this throws away very little and stops the thing it
 * throws away from being confidently wrong. A site Majestic knows nothing
 * about should come back as "no suggestion", which is true, rather than as a
 * category somebody has to notice is nonsense.
 */
export const MIN_TOPIC_VALUE = 5;

export interface NicheSuggestion {
  /** What the site is about, as far as its backlinks can say. */
  primary: NicheSlug;
  /** The other categories its topics point at, strongest first. */
  secondary: NicheSlug[];
  /** The topic the primary came from, so a reviewer can judge it. */
  from: TopicReading;
}

/**
 * What to suggest for a listing, given its top topics.
 *
 * All three topics are used, not just the first. The second and third are
 * what the secondary niche field on a listing is for - a Swedish football
 * site whose links come from sports and news is both, and a buyer filtering
 * for either should find it. Discarding them, which this did at first, threw
 * away a category for six hundred of nine hundred listings.
 *
 * The strongest mappable topic is the primary rather than strictly the first:
 * a site leading with `Regional/Europe` and following with `Recreation/Travel`
 * is a travel site, and refusing to look past the first would leave it
 * uncategorised.
 *
 * `null` when nothing clears the noise floor, which is the honest outcome for
 * a domain with no backlink profile to speak of.
 */
export function suggestNiches(topics: readonly TopicReading[]): NicheSuggestion | null {
  const usable = topics.filter((reading) => reading.value >= MIN_TOPIC_VALUE);

  let primary: NicheSlug | null = null;
  let from: TopicReading | null = null;
  const secondary: NicheSlug[] = [];

  for (const reading of usable) {
    const niche = nicheFromTopic(reading.topic);
    if (!niche) continue;

    if (!primary) {
      primary = niche;
      from = reading;
      continue;
    }
    // A topic that maps to the primary again adds nothing, and the same
    // category twice in the secondary list is noise of a different kind.
    if (niche !== primary && !secondary.includes(niche)) secondary.push(niche);
  }

  return primary && from ? { primary, secondary, from } : null;
}

/**
 * The primary alone.
 *
 * Kept because a caller that only wants the category should not have to know
 * about the rest, and because it is what the older callers ask for.
 */
export function suggestNiche(topics: readonly TopicReading[]): {
  niche: NicheSlug;
  from: TopicReading;
} | null {
  const suggestion = suggestNiches(topics);
  return suggestion ? { niche: suggestion.primary, from: suggestion.from } : null;
}
