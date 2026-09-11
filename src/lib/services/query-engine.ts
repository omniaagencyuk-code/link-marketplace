import type {
  LinkTypeSlug,
  PaginatedResult,
  SortKey,
  Website,
  WebsiteListItem,
  WebsiteQuery,
} from '@/lib/types';

/** Order services are presented in across list views. */
const servicePriority: LinkTypeSlug[] = ['guest-post', 'niche-edit', 'digital-pr'];

/** Attach the denormalised fields list views and sorting rely on. */
export function toListItem(website: Website): WebsiteListItem {
  const available = website.services.filter((service) => service.available);
  const pool = available.length > 0 ? available : website.services;
  const ordered = [...pool].sort(
    (a, b) => servicePriority.indexOf(a.type) - servicePriority.indexOf(b.type),
  );
  const headlineService = ordered[0] ?? null;

  return {
    ...website,
    headlineService,
    headlinePriceMinor: headlineService?.priceMinor ?? 0,
    lowestPriceMinor: pool.length ? Math.min(...pool.map((service) => service.priceMinor)) : 0,
    fastestTurnaroundDays: headlineService?.turnaroundMinDays ?? 0,
    availableLinkTypes: ordered.map((service) => service.type),
  };
}

function withinRange(value: number, range?: { min?: number; max?: number }) {
  if (!range) return true;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

/** Simple relevance score: domain match beats title, which beats description. */
function relevanceScore(item: WebsiteListItem, term: string) {
  if (!term) return 0;
  const needle = term.toLowerCase();
  let score = 0;
  if (item.domain.toLowerCase().startsWith(needle)) score += 100;
  if (item.domain.toLowerCase().includes(needle)) score += 60;
  if (item.title.toLowerCase().includes(needle)) score += 30;
  if (item.niche.includes(needle)) score += 20;
  if (item.description.toLowerCase().includes(needle)) score += 10;
  return score;
}

export function matchesQuery(item: WebsiteListItem, query: WebsiteQuery) {
  const term = query.search?.trim().toLowerCase() ?? '';
  if (term) {
    const haystack = `${item.domain} ${item.title} ${item.description} ${item.niche} ${item.secondaryNiches.join(' ')}`.toLowerCase();
    if (!term.split(/\s+/).every((part) => haystack.includes(part))) return false;
  }

  if (query.niches?.length) {
    const inPrimary = query.niches.includes(item.niche);
    const inSecondary = item.secondaryNiches.some((niche) => query.niches!.includes(niche));
    if (!inPrimary && !inSecondary) return false;
  }

  if (query.countries?.length && !query.countries.includes(item.country)) return false;
  if (query.languages?.length && !query.languages.includes(item.language)) return false;

  if (query.linkTypes?.length) {
    const hasType = item.services.some(
      (service) => service.available && query.linkTypes!.includes(service.type),
    );
    if (!hasType) return false;
  }

  if (query.linkAttribute && item.rules.linkAttribute !== query.linkAttribute) return false;
  if (!withinRange(item.metrics.domainRating, query.domainRating)) return false;
  if (!withinRange(item.metrics.organicTraffic, query.organicTraffic)) return false;
  if (!withinRange(item.metrics.referringDomains, query.referringDomains)) return false;

  if (query.price) {
    // A site matches if any offered service falls inside the price window.
    const prices = item.services
      .filter(
        (service) =>
          service.available &&
          (!query.linkTypes?.length || query.linkTypes.includes(service.type)),
      )
      .map((service) => service.priceMinor);
    if (!prices.some((price) => withinRange(price, query.price))) return false;
  }

  if (query.maxTurnaroundDays !== undefined) {
    const fastest = Math.min(
      ...item.services
        .filter((service) => service.available)
        .map((service) => service.turnaroundMaxDays),
    );
    if (!Number.isFinite(fastest) || fastest > query.maxTurnaroundDays) return false;
  }

  if (query.verifiedOnly && !item.verified) return false;

  return true;
}

export function sortItems(items: WebsiteListItem[], sort: SortKey, term: string) {
  const sorted = [...items];
  switch (sort) {
    case 'price-asc':
      sorted.sort((a, b) => a.headlinePriceMinor - b.headlinePriceMinor);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.headlinePriceMinor - a.headlinePriceMinor);
      break;
    case 'dr-desc':
      sorted.sort((a, b) => b.metrics.domainRating - a.metrics.domainRating);
      break;
    case 'traffic-desc':
      sorted.sort((a, b) => b.metrics.organicTraffic - a.metrics.organicTraffic);
      break;
    case 'turnaround-asc':
      sorted.sort((a, b) => a.fastestTurnaroundDays - b.fastestTurnaroundDays);
      break;
    case 'newest':
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
    case 'relevance':
    default:
      sorted.sort((a, b) => {
        const scoreDelta = relevanceScore(b, term) - relevanceScore(a, term);
        if (scoreDelta !== 0) return scoreDelta;
        // Fall back to a quality signal so the default order is still useful.
        const aQuality = a.metrics.domainRating * 1000 + a.completedOrders;
        const bQuality = b.metrics.domainRating * 1000 + b.completedOrders;
        return bQuality - aQuality;
      });
  }
  return sorted;
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total: items.length,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/** Run a full query against an in-memory collection. */
export function runQuery(
  source: WebsiteListItem[],
  query: WebsiteQuery,
): PaginatedResult<WebsiteListItem> {
  const filtered = source.filter((item) => matchesQuery(item, query));
  const sorted = sortItems(filtered, query.sort ?? 'relevance', query.search?.trim() ?? '');
  return paginate(sorted, query.page ?? 1, query.pageSize ?? 25);
}
