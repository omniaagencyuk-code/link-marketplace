import { linkPackages } from '@/lib/config/packages';
import {
  isOfferable,
  packageHref,
  packageLines,
  packageQuery,
  packageTotalMinor,
} from '@/lib/packages/rules';
import type { LinkPackage, PackageLine } from '@/lib/packages/rules';
import { bandTraffic } from '@/lib/services/niche-landing';
import { websiteService } from '@/lib/services/website-service';
import { nicheName } from '@/lib/data/categories';
import { currencySymbol, formatNumber } from '@/lib/utils/format';

/**
 * What a packages page may show about a package.
 *
 * ## Nothing here can hold a domain
 *
 * The same constraint `SampleRow` is built to on the niche pages, and for
 * the same reason: the marketplace is account-only, these pages are not, and
 * a published row naming a publisher is inventory nobody gave us permission
 * to publish. There is no field below that could carry one, so there is
 * nothing identifying in the HTML, in the RSC payload, or anywhere else a
 * determined reader might look - rather than a rule somebody has to keep
 * remembering while editing the page.
 *
 * A signed-in buyer sees the real sites, because by then they are in the
 * marketplace, where listings have always been visible.
 */
export interface PackageRow {
  /** Positional. Not derived from anything about the listing. */
  key: string;
  /** e.g. "Business publisher". The category, not the publication. */
  label: string;
  domainRating: number;
  /** Banded, e.g. "69K". */
  traffic: string;
  /** Two-letter market, or a dash. */
  country: string;
}

export interface PackageOffer {
  slug: string;
  name: string;
  blurb: string;
  count: number;
  /** e.g. "$2,450". Computed from the listings the basket would hold. */
  total: string;
  /** The domain rating range actually on offer, not the filter's bounds. */
  drMin: number;
  drMax: number;
  rows: PackageRow[];
  /** The marketplace, filtered to what this package buys. */
  browseHref: string;
}

/** The label a row carries: the niche where a package names exactly one. */
function labelFor(pkg: LinkPackage): string {
  if (pkg.filters.niches.length !== 1) return 'Publisher';

  return `${nicheName(pkg.filters.niches[0])} publisher`;
}

function toRows(pkg: LinkPackage, lines: readonly PackageLine[]): PackageRow[] {
  const label = labelFor(pkg);

  return lines.map((line, index) => ({
    key: `line-${index}`,
    label,
    domainRating: line.item.metrics.domainRating,
    traffic: bandTraffic(line.item.metrics.organicTraffic),
    country: line.item.country ?? '—',
  }));
}

/**
 * One package, priced against the inventory as it is right now.
 *
 * Null where it cannot be filled. A package promising ten placements that
 * can only find seven is not a cheaper package - it is a card that misleads
 * before the click and disappoints after it - so it is withheld, the way a
 * niche thinner than `MIN_LISTINGS_FOR_A_PAGE` gets no page.
 *
 * Every figure comes from the listings `packageLines` chose, which are the
 * listings the basket would hold. Nothing on the card is read from the
 * package definition except its words.
 */
export async function packageOffer(pkg: LinkPackage): Promise<PackageOffer | null> {
  const { items } = await websiteService.search(packageQuery(pkg));
  const lines = packageLines(pkg, items);

  if (!isOfferable(pkg, lines)) return null;

  const totalMinor = packageTotalMinor(lines);
  if (totalMinor === null) return null;

  const ratings = lines.map((line) => line.item.metrics.domainRating);

  return {
    slug: pkg.slug,
    name: pkg.name,
    blurb: pkg.blurb,
    count: pkg.count,
    /*
      Whole units. A package total carrying cents would be quoting a
      precision the basket does not promise - lines are repriced at
      checkout, and a publisher repricing between the two is the ordinary
      case rather than the exception.
    */
    total: `${currencySymbol()}${formatNumber(Math.round(totalMinor / 100))}`,
    drMin: Math.min(...ratings),
    drMax: Math.max(...ratings),
    rows: toRows(pkg, lines),
    browseHref: packageHref(pkg),
  };
}

/**
 * Every package that can be filled today, in the order they are shipped in.
 *
 * Read one package at a time rather than one read for all of them: each is
 * a different search, and each asks for only its own `count` rows. Three
 * packages is three small queries, which is the shape this codebase learned
 * to prefer the hard way - /guest-posts spent a month timing out because one
 * page read the whole inventory to describe part of it.
 */
export async function packageOffers(): Promise<PackageOffer[]> {
  const offers = await Promise.all(linkPackages.map((pkg) => packageOffer(pkg)));

  return offers.filter((offer): offer is PackageOffer => offer !== null);
}

/**
 * The actual placements in a package, domains and all.
 *
 * For signed-in buyers only. Everything `PackageOffer` withholds is here -
 * which is the whole difference between the two, and why they are separate
 * functions rather than one with a flag. A flag is one wrong argument away
 * from publishing the inventory; two functions put the decision in the
 * import.
 *
 * Null when the package cannot be filled, for the same reason
 * `packageOffer` returns null: a buyer who followed a card promising ten
 * placements should not land on a page offering seven.
 */
export async function packageContents(
  pkg: LinkPackage,
): Promise<{ lines: PackageLine[]; totalMinor: number } | null> {
  const { items } = await websiteService.search(packageQuery(pkg));
  const lines = packageLines(pkg, items);

  if (!isOfferable(pkg, lines)) return null;

  const totalMinor = packageTotalMinor(lines);
  if (totalMinor === null) return null;

  return { lines, totalMinor };
}
