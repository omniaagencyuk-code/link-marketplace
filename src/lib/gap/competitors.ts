import { isValidDomain, normaliseDomain } from '@/lib/import/normalise';

/**
 * Turning Ahrefs' organic competitors into competitor boxes worth paying for.
 *
 * Pure: rows in, suggestions out. No network and no database, because the
 * thing being decided is which domains we are about to spend 2,500 units each
 * pulling referring domains for.
 *
 * ## Why Ahrefs and not a model
 *
 * A model cannot know who ranks for what. Asked for a site's competitors it
 * produces plausible companies in the right industry, which is a different
 * thing and reads the same. The cost of being wrong is not a bad answer on a
 * screen: each invented competitor becomes a real 5,000-unit referring-domain
 * pull against a site nobody competes with. Ahrefs' answer costs fifty units
 * for the whole list and is measured rather than imagined.
 *
 * ## Why the list needs filtering at all
 *
 * The endpoint ranks by shared keywords, and the sites sharing the most
 * keywords with anything are the platforms that rank for everything. Measured
 * against `ahrefs.com`, `google.com` came back fifth. Suggesting it would be
 * 2,500 units to learn that Google's referring domains are other giants, none
 * of which we sell and none of which anybody can email.
 *
 * The filter applies to *suggestions only*. A customer who insists on
 * comparing against Amazon can still type it in: that is their fifty units of
 * allowance to spend as they like, and refusing a domain somebody deliberately
 * entered is a different and worse decision from not proposing it ourselves.
 */

/**
 * Columns asked for, all unsurcharged.
 *
 * `keywords_common` and `domain_rating` are free at one unit a row; `traffic`
 * and either keyword-difficulty column are ten a row. Three columns against a
 * handful of rows lands under the floor either way, but the select is what
 * would make this expensive if it grew.
 */
export const SUGGESTION_COLUMNS = 3;

/**
 * How many to ask Ahrefs for.
 *
 * More than the three boxes a report has, because the filter below removes
 * some and the customer may not want the rest. Still far under the row count
 * that would cost more than the floor.
 */
export const SUGGESTION_ROWS = 12;

/**
 * Platforms that rank for everything, and are never a useful gap competitor.
 *
 * Not a quality judgement - it is that their referring domains are other
 * giants. A gap against YouTube is a list of sites we cannot sell and nobody
 * can pitch.
 *
 * Matched against every ancestor of the domain, so `en.wikipedia.org` and
 * `news.google.com` are caught as well, and against the stems that run across
 * markets, so `amazon.co.uk` is caught without listing every country.
 */
const PLATFORM_DOMAINS = new Set([
  'apple.com',
  'bing.com',
  'duckduckgo.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'medium.com',
  'microsoft.com',
  'pinterest.com',
  'quora.com',
  'reddit.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'yahoo.com',
  'yelp.com',
  'youtube.com',
]);

/** Stems with a country domain per market: `google.de`, `amazon.co.uk`. */
const PLATFORM_STEMS = new Set(['amazon', 'ebay', 'google', 'wikipedia']);

/** Is this one of the platforms, under any subdomain or any market? */
export function isPlatform(domain: string): boolean {
  const labels = domain.split('.');

  for (let index = 0; index < labels.length - 1; index += 1) {
    const ancestor = labels.slice(index).join('.');
    if (PLATFORM_DOMAINS.has(ancestor)) return true;
    if (PLATFORM_STEMS.has(labels[index] ?? '')) return true;
  }

  return false;
}

export interface SuggestionInput {
  domain: string;
  keywordsCommon: number;
  domainRating: number;
}

export interface Suggestion {
  domain: string;
  keywordsCommon: number;
  domainRating: number;
}

/**
 * The suggestions worth offering, closest first.
 *
 * "Closest" is shared keywords, which is the measure the customer actually
 * wants: a site competing for the same searches has the links that would help,
 * where a site with a higher domain rating and nothing in common does not.
 * Domain rating comes back with it so they can see what they are choosing
 * between, and never as the ranking.
 */
export function rankSuggestions(
  rows: SuggestionInput[],
  options: { target: string; limit: number },
): Suggestion[] {
  const target = normaliseDomain(options.target ?? '');
  const seen = new Set<string>(target ? [target] : []);
  const kept: Suggestion[] = [];

  for (const row of rows) {
    const domain = normaliseDomain(row.domain ?? '');
    if (!domain || !isValidDomain(domain)) continue;

    /*
      The target's own subdomains, not only the target.

      `mode=subdomains` means a site with a shop or a blog on a subdomain can
      come back as its own competitor, and a pull for that is 2,500 units for a
      gap that is empty by definition.
    */
    if (target && (domain === target || domain.endsWith(`.${target}`))) continue;
    if (isPlatform(domain)) continue;
    if (seen.has(domain)) continue;

    seen.add(domain);
    kept.push({
      domain,
      keywordsCommon: Math.max(0, Math.round(row.keywordsCommon ?? 0)),
      domainRating: Math.max(0, Math.round(row.domainRating ?? 0)),
    });
  }

  return kept
    .sort((a, b) => b.keywordsCommon - a.keywordsCommon || a.domain.localeCompare(b.domain))
    .slice(0, Math.max(0, options.limit));
}
