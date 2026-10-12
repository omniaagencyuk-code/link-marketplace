import type { PlannerLink, PlannerStatus } from '@/lib/types/planner';

/**
 * Which rows a planner shows, and in what order.
 *
 * ## Why this is a module and not two implementations
 *
 * The table is paged, so filtering and sorting have to happen in the
 * database - fifty rows filtered in the browser is a filter over a page,
 * which is the bug `verify:search` exists to stop happening again. But the
 * planner also runs against an in-memory store with no database at all, and
 * that path is the one a reviewer sees from a clone.
 *
 * So the rules live here once, in a form the mock applies directly and the
 * service translates. They cannot be made to agree by being written twice.
 * What is still not proven is the translation itself: the same fixtures
 * cannot be run through PostgREST from a clone the way `verify:search` runs
 * them through Postgres. Every predicate below is therefore the simplest
 * shape that translates one-to-one - a containment, a range, a set
 * membership - and nothing clever.
 *
 * ## Blank sorts last, in both directions
 *
 * A row nobody has researched has no domain rating. Sorting descending by
 * DR must not put it above a 92, and sorting ascending must not put it
 * below a 3: it is not a high number or a low number, it is not a number.
 * Postgres' default is nulls last ascending and nulls first descending, so
 * the direction is given explicitly on both sides there, and the comparator
 * here does the same thing.
 */

export const PLANNER_SORT_KEYS = [
  'added',
  'domain',
  'domainRating',
  'organicTraffic',
  'priceMinor',
  'plannedDate',
  'liveDate',
  'status',
] as const;

export type PlannerSortKey = (typeof PLANNER_SORT_KEYS)[number];

export interface PlannerSort {
  key: PlannerSortKey;
  ascending: boolean;
}

/** Oldest first, which is the order somebody typed them in. */
export const DEFAULT_SORT: PlannerSort = { key: 'added', ascending: true };

export interface PlannerFilter {
  /** Status ids. Empty means every status, not none. */
  statusIds: string[];
  sources: string[];
  linkTypes: string[];
  /** Substring of the domain, matched case-insensitively. */
  domain: string;
  /** Substring of the anchor text. */
  anchor: string;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  /** Planned date range, inclusive. */
  plannedFrom: string | null;
  plannedTo: string | null;
}

export const NO_FILTER: PlannerFilter = {
  statusIds: [],
  sources: [],
  linkTypes: [],
  domain: '',
  anchor: '',
  priceMinMinor: null,
  priceMaxMinor: null,
  plannedFrom: null,
  plannedTo: null,
};

export function filterIsActive(filter: PlannerFilter): boolean {
  return (
    filter.statusIds.length > 0 ||
    filter.sources.length > 0 ||
    filter.linkTypes.length > 0 ||
    filter.domain !== '' ||
    filter.anchor !== '' ||
    filter.priceMinMinor !== null ||
    filter.priceMaxMinor !== null ||
    filter.plannedFrom !== null ||
    filter.plannedTo !== null
  );
}

/** How many of the eight are set, for the "clear" button's count. */
export function activeFilterCount(filter: PlannerFilter): number {
  return [
    filter.statusIds.length > 0,
    filter.sources.length > 0,
    filter.linkTypes.length > 0,
    filter.domain !== '',
    filter.anchor !== '',
    filter.priceMinMinor !== null || filter.priceMaxMinor !== null,
    filter.plannedFrom !== null || filter.plannedTo !== null,
  ].filter(Boolean).length;
}

// ------------------------------------------------------------- the URL

const SORT_PARAMS: Record<string, PlannerSortKey> = {
  added: 'added',
  domain: 'domain',
  dr: 'domainRating',
  traffic: 'organicTraffic',
  price: 'priceMinor',
  planned: 'plannedDate',
  live: 'liveDate',
  status: 'status',
};

const SORT_KEY_PARAMS = Object.fromEntries(
  Object.entries(SORT_PARAMS).map(([param, key]) => [key, param]),
) as Record<PlannerSortKey, string>;

export function sortParam(sort: PlannerSort): string {
  return SORT_KEY_PARAMS[sort.key];
}

/**
 * Read the filter out of the query string.
 *
 * Every value is bounded here rather than trusted, because the query string
 * is the one input to this screen that nobody has to use the screen to set.
 * A fifty-thousand-character search term is a query the database has to
 * plan, and a comma list of ten thousand ids is a URL that falls over
 * somewhere less obvious.
 */
export function readFilter(one: (key: string) => string | undefined): PlannerFilter {
  const list = (value: string | undefined, max: number): string[] =>
    (value ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, max);

  const money = (value: string | undefined): number | null => {
    if (!value) return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.min(Math.round(parsed * 100), 2_000_000_000);
  };

  const date = (value: string | undefined): string | null =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

  /*
    `*` is dropped from a search term rather than escaped.

    PostgREST converts `*` to `%` in a `like` pattern before Postgres sees
    it, so a term containing one would be a wildcard against the database
    and a literal against the in-memory store - the two sides disagreeing,
    which is the one thing this module exists to prevent. There is no
    escape that survives that conversion, and a `*` in a domain or an
    anchor is not a thing, so neither side gets it.
  */
  const term = (value: string | undefined): string =>
    (value ?? '').replace(/\*/g, '').trim().slice(0, 100);

  return {
    statusIds: list(one('status'), 40),
    sources: list(one('source'), 40),
    linkTypes: list(one('type'), 40),
    domain: term(one('q')),
    anchor: term(one('anchor')),
    priceMinMinor: money(one('pmin')),
    priceMaxMinor: money(one('pmax')),
    plannedFrom: date(one('from')),
    plannedTo: date(one('to')),
  };
}

export function readSort(one: (key: string) => string | undefined): PlannerSort {
  const key = SORT_PARAMS[(one('sort') ?? '').toLowerCase()];
  if (!key) return DEFAULT_SORT;
  /* Text ascends, numbers descend. Nobody sorting by domain rating wants
     the worst publisher first, and nobody sorting by domain wants Z. */
  const textual = key === 'domain' || key === 'added' || key === 'status';
  const asked = (one('dir') ?? '').toLowerCase();
  if (asked === 'asc') return { key, ascending: true };
  if (asked === 'desc') return { key, ascending: false };
  return { key, ascending: textual };
}

/** The filter and sort as query parameters, for building a link. */
export function filterParams(filter: PlannerFilter, sort: PlannerSort): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.statusIds.length) params.status = filter.statusIds.join(',');
  if (filter.sources.length) params.source = filter.sources.join(',');
  if (filter.linkTypes.length) params.type = filter.linkTypes.join(',');
  if (filter.domain) params.q = filter.domain;
  if (filter.anchor) params.anchor = filter.anchor;
  if (filter.priceMinMinor !== null) params.pmin = String(filter.priceMinMinor / 100);
  if (filter.priceMaxMinor !== null) params.pmax = String(filter.priceMaxMinor / 100);
  if (filter.plannedFrom) params.from = filter.plannedFrom;
  if (filter.plannedTo) params.to = filter.plannedTo;
  if (sort.key !== DEFAULT_SORT.key || sort.ascending !== DEFAULT_SORT.ascending) {
    params.sort = sortParam(sort);
    params.dir = sort.ascending ? 'asc' : 'desc';
  }
  return params;
}

// ------------------------------------------------- applying it, in memory

export function matchesFilter(link: PlannerLink, filter: PlannerFilter): boolean {
  if (filter.statusIds.length && !filter.statusIds.includes(link.statusId)) return false;
  if (filter.sources.length && !filter.sources.includes(link.source)) return false;
  if (filter.linkTypes.length && !filter.linkTypes.includes(link.linkType)) return false;

  if (filter.domain && !link.domain.toLowerCase().includes(filter.domain.toLowerCase())) {
    return false;
  }
  if (filter.anchor && !link.anchorText.toLowerCase().includes(filter.anchor.toLowerCase())) {
    return false;
  }

  /*
    A price range excludes a row with no price, rather than treating it as
    nothing. "Between £100 and £300" is a question about rows that have a
    price; a blank is not £0 and answering as though it were is how a
    budget report comes to include every row somebody has not negotiated.
  */
  if (filter.priceMinMinor !== null) {
    if (link.priceMinor === null || link.priceMinor < filter.priceMinMinor) return false;
  }
  if (filter.priceMaxMinor !== null) {
    if (link.priceMinor === null || link.priceMinor > filter.priceMaxMinor) return false;
  }

  // The same rule for dates, for the same reason.
  if (filter.plannedFrom !== null) {
    if (link.plannedDate === null || link.plannedDate < filter.plannedFrom) return false;
  }
  if (filter.plannedTo !== null) {
    if (link.plannedDate === null || link.plannedDate > filter.plannedTo) return false;
  }

  return true;
}

/**
 * The comparator, matching what the database is asked to do.
 *
 * Blank last whichever way the arrow points, then the key, then `createdAt`
 * so two rows with the same domain rating do not swap places between pages -
 * an unstable sort under paging shows the same row twice and hides another.
 */
export function compareLinks(
  a: PlannerLink,
  b: PlannerLink,
  sort: PlannerSort,
  statusOrder: Map<string, number>,
): number {
  const direction = sort.ascending ? 1 : -1;

  const nullsLast = (left: unknown, right: unknown): number | null => {
    const leftBlank = left === null || left === undefined || left === '';
    const rightBlank = right === null || right === undefined || right === '';
    if (leftBlank && rightBlank) return 0;
    if (leftBlank) return 1;
    if (rightBlank) return -1;
    return null;
  };

  const numeric = (left: number | null, right: number | null): number => {
    const blank = nullsLast(left, right);
    if (blank !== null) return blank === 0 ? 0 : blank;
    return ((left as number) - (right as number)) * direction;
  };

  const textual = (left: string, right: string): number => {
    const blank = nullsLast(left, right);
    if (blank !== null) return blank === 0 ? 0 : blank;
    return left.localeCompare(right, 'en') * direction;
  };

  let result = 0;
  switch (sort.key) {
    case 'domain':
      result = textual(a.domainKey, b.domainKey);
      break;
    case 'domainRating':
      result = numeric(a.domainRating, b.domainRating);
      break;
    case 'organicTraffic':
      result = numeric(a.organicTraffic, b.organicTraffic);
      break;
    case 'priceMinor':
      result = numeric(a.priceMinor, b.priceMinor);
      break;
    case 'plannedDate':
      result = textual(a.plannedDate ?? '', b.plannedDate ?? '');
      break;
    case 'liveDate':
      result = textual(a.liveDate ?? '', b.liveDate ?? '');
      break;
    case 'status':
      result = numeric(statusOrder.get(a.statusId) ?? null, statusOrder.get(b.statusId) ?? null);
      break;
    case 'added':
      result = textual(a.createdAt, b.createdAt);
      break;
  }

  if (result !== 0) return result;
  // The tie-break never flips with the arrow: it is there for stability,
  // not to be a second sort somebody asked for.
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function statusOrdering(statuses: PlannerStatus[]): Map<string, number> {
  return new Map(statuses.map((status) => [status.id, status.sortOrder]));
}
