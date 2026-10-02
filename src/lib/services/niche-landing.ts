import { websiteService } from '@/lib/services';
import { inNiche } from '@/lib/marketplace/topic';
import { countryShortNameOrUnknown } from '@/lib/data/countries';
import { currencySymbol } from '@/lib/utils/format';
import { NICHE_COPY } from '@/lib/content/niche-guest-posts';
import type { NicheSlug, WebsiteListItem } from '@/lib/types';

/**
 * What a public niche page is allowed to know.
 *
 * These pages are the one place inventory is described to people without an
 * account, so the rule is absolute: nothing identifying crosses this boundary.
 * Not the domain, not the slug, not the URL, not the title. A `SampleRow` has
 * no field that could hold one, which is a stronger guarantee than remembering
 * not to render a field that is there - a component cannot leak what it was
 * never given, and neither can an RSC payload.
 *
 * Masking here rather than in the page is deliberate for the same reason the
 * redacted preview does it in the service: the component is the thing somebody
 * edits later.
 */

/** A listing as a stranger may see it. Deliberately holds no identifier. */
export interface SampleRow {
  /** Positional. Not derived from anything about the listing. */
  key: string;
  /** e.g. "Technology publisher". The category, not the publication. */
  label: string;
  domainRating: number;
  /** Banded, e.g. "69K". */
  traffic: string;
  /** Two-letter market, or a dash. */
  country: string;
  /** e.g. "from $685". */
  price: string;
}

export interface NicheStats {
  listings: number;
  drMin: number;
  drMax: number;
  countries: number;
  /** The cheapest placement in the niche, formatted. */
  startingPrice: string;
}

export interface NicheLanding {
  slug: NicheSlug;
  stats: NicheStats;
  samples: SampleRow[];
}

/**
 * The minimum inventory a page is worth publishing on.
 *
 * A page describing four publishers is a page that disappoints whoever follows
 * it from a search result, and a thin page across fifteen niches is worse for
 * the ones that are real.
 */
export const MIN_LISTINGS_FOR_A_PAGE = 10;

/**
 * Listings too quiet to show as an example.
 *
 * A sample table is a claim about what is in the marketplace. A publisher with
 * a strong domain rating and no readers is the thing buyers in this industry
 * are most often sold, and putting one in the window would be making exactly
 * that pitch.
 */
const MIN_TRAFFIC_FOR_A_SAMPLE = 500;

const SAMPLE_COUNT = 10;

function bandTraffic(value: number): string {
  if (value >= 1_000_000) return `${(Math.round(value / 100_000) / 10).toFixed(1)}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(Math.round(value / 100) / 10).toFixed(1)}K`;
  return `${Math.round(value / 100) * 100}`;
}

/**
 * A spread, not the top ten.
 *
 * Ten rows all at DR 80 and £700 describe a marketplace nobody can afford and
 * misrepresent one that has range. Sorting by domain rating and then taking an
 * even stride through the list gives the strongest site, the cheapest, and
 * eight points between them - which is both more honest and more useful to
 * somebody working out whether their budget fits.
 */
export function spread<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = (items.length - 1) / (count - 1);
  const picked: T[] = [];
  for (let index = 0; index < count; index += 1) {
    picked.push(items[Math.round(index * step)]!);
  }
  return picked;
}

/** The rows a public page may show, with everything identifying removed. */
export function toSampleRows(
  websites: readonly WebsiteListItem[],
  label: string,
  symbol = currencySymbol(),
): SampleRow[] {
  const worthShowing = websites
    .filter((website) => website.metrics.organicTraffic >= MIN_TRAFFIC_FOR_A_SAMPLE)
    .filter((website) => website.lowestPriceMinor > 0)
    .slice()
    .sort((a, b) => b.metrics.domainRating - a.metrics.domainRating);

  return spread(worthShowing, SAMPLE_COUNT).map((website, index) => ({
    key: `sample-${index}`,
    label,
    domainRating: website.metrics.domainRating,
    traffic: bandTraffic(website.metrics.organicTraffic),
    country: countryShortNameOrUnknown(website.country),
    price: `from ${symbol}${Math.round(website.lowestPriceMinor / 100)}`,
  }));
}

export function toStats(websites: readonly WebsiteListItem[], symbol = currencySymbol()): NicheStats {
  const ratings = websites.map((website) => website.metrics.domainRating).filter((dr) => dr > 0);
  const prices = websites.map((website) => website.lowestPriceMinor).filter((price) => price > 0);
  const countries = new Set(
    websites.map((website) => website.country).filter((country): country is string => Boolean(country)),
  );

  return {
    listings: websites.length,
    drMin: ratings.length ? Math.min(...ratings) : 0,
    drMax: ratings.length ? Math.max(...ratings) : 0,
    countries: countries.size,
    startingPrice: prices.length ? `${symbol}${Math.round(Math.min(...prices) / 100)}` : '',
  };
}

/**
 * Every niche with enough live inventory to be worth a page.
 *
 * Read once and shared by the index, the sitemap and `generateStaticParams`,
 * so the three cannot disagree about which pages exist - a sitemap listing a
 * page that does not exist is a 404 reported back as a crawl error.
 */
export async function publishedNiches(): Promise<NicheSlug[]> {
  /*
    Counted the way the pages themselves select, with `inNiche`.

    `countByNiche` was the obvious thing to reach for and is the wrong rule: it
    counts a listing under its primary niche only, while a niche page shows
    every listing in that niche primary or secondary - the same rule the
    marketplace's own filter uses. Finance had seven primary and ten in total,
    so the page rendered and the sitemap never mentioned it. One read, one
    predicate, and the two cannot disagree again.
  */
  const active = await websiteService.getAll();

  return (Object.keys(NICHE_COPY) as NicheSlug[])
    .filter(
      (slug) =>
        active.filter((website) => inNiche(website, slug)).length >= MIN_LISTINGS_FOR_A_PAGE,
    )
    .sort();
}

/** The page's data, or nothing when the niche is too thin to publish. */
export async function nicheLanding(slug: NicheSlug): Promise<NicheLanding | null> {
  if (!NICHE_COPY[slug]) return null;

  const listings = await websiteService.listForNiche(slug);
  if (listings.length < MIN_LISTINGS_FOR_A_PAGE) return null;

  const copy = NICHE_COPY[slug]!;
  return {
    slug,
    stats: toStats(listings),
    samples: toSampleRows(listings, `${copy.heading.replace(/ guest posts$/i, '')} publisher`),
  };
}
