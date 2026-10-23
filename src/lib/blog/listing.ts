import { postCategories } from '@/lib/config/blog';
import type { BlogPost, PostCategorySlug } from '@/lib/types/blog';

/**
 * What the resources index asks for, and what matches.
 *
 * One copy of the rule, for the same reason `planner/filter.ts` is one copy:
 * the in-memory store applies these functions directly and
 * `cms-repository` translates them into PostgREST, and only the first of
 * those two can be run from a clone. So every predicate here is the simplest
 * shape that translates one-to-one - a case-insensitive substring over two
 * columns, and a category equality - and nothing clever that would have to
 * be re-expressed differently on the other side.
 *
 * The page is sliced here too, because "which twelve posts are page two" is
 * arithmetic that must agree between the two paths exactly or a post falls
 * between pages and nothing says so.
 */

/** How many articles a page of the index shows. */
export const PER_PAGE = 9;

export interface ListingQuery {
  /** A category slug, or undefined for every category. */
  category?: PostCategorySlug;
  /** What the reader typed. Trimmed; empty means no search. */
  search?: string;
  /** 1-based. Out of range is clamped rather than refused. */
  page?: number;
}

export interface ListingResult {
  posts: BlogPost[];
  /** Matching posts across every page, for the pager and the count. */
  total: number;
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
}

/**
 * The search terms a post can be found by.
 *
 * Title and excerpt because they are what a reader saw, and the category's
 * display name because "link building" is how somebody asks for that
 * category without knowing it is a filter. The body is deliberately not
 * searched: it would match a word mentioned once in passing and bury the
 * article actually about the subject, and on the database side it would mean
 * scanning every article's markdown on every keystroke.
 */
export function searchableText(post: BlogPost): string {
  const category = postCategories.find((entry) => entry.slug === post.category);
  return [post.title, post.excerpt, category?.name ?? post.category].join(' ').toLowerCase();
}

/** Trimmed, lowercased, or undefined when there is nothing to search for. */
export function readSearch(raw: string | undefined): string | undefined {
  const term = (raw ?? '').trim();
  return term.length > 0 ? term : undefined;
}

/** Does this post match the term? Case-insensitive substring. */
export function matchesSearch(post: BlogPost, term: string): boolean {
  return searchableText(post).includes(term.toLowerCase());
}

/** 1-based, a whole number, never below one. Anything else is page one. */
export function readPage(raw: string | undefined): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/**
 * How many pages a total needs.
 *
 * One for an empty result rather than zero: a reader who searches for
 * something nobody wrote is on page one of one, not page one of nothing, and
 * the pager has to have somewhere to put them.
 */
export function pageCountFor(total: number, perPage = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** The 0-based row the given page starts at, after clamping. */
export function offsetFor(page: number, total: number, perPage = PER_PAGE): number {
  const clamped = Math.min(Math.max(page, 1), pageCountFor(total, perPage));
  return (clamped - 1) * perPage;
}

/**
 * Apply the whole query to a list of live posts, newest first.
 *
 * The in-memory path. `cms-repository` does the same thing in PostgREST and
 * `verify:resources` runs the two against the same fixtures.
 */
export function applyListing(
  posts: BlogPost[],
  query: ListingQuery,
  perPage = PER_PAGE,
): ListingResult {
  let matching = posts;
  if (query.category) matching = matching.filter((post) => post.category === query.category);

  const term = readSearch(query.search);
  if (term) matching = matching.filter((post) => matchesSearch(post, term));

  const total = matching.length;
  const pageCount = pageCountFor(total, perPage);
  const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
  const offset = (page - 1) * perPage;

  return { posts: matching.slice(offset, offset + perPage), total, page, pageCount };
}

/**
 * The href for a view of the index.
 *
 * One copy, because the pager, the pills and the canonical tag all have to
 * agree about what a view's URL is - and a canonical that disagrees with the
 * link that reached it is the duplicate-content problem it was meant to
 * prevent. Page one never carries `page=1`: /resources and /resources?page=1
 * would otherwise be two URLs for one thing.
 */
export function listingHref(query: ListingQuery): string {
  const params = new URLSearchParams();
  if (query.category) params.set('category', query.category);
  const term = readSearch(query.search);
  if (term) params.set('q', term);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return search ? `/resources?${search}` : '/resources';
}

/**
 * Whether a view should be indexed.
 *
 * A category is a real section somebody links to, and a page of it is a real
 * page of that section, so both are indexable and each carries its own
 * canonical. A search is a reader's own words: every term makes a URL, none
 * of them is a page anybody linked to, and indexing them is how a site grows
 * thousands of thin archive pages. So a search result is `noindex`, and it
 * still renders, still works and is still crawlable - it is just not
 * something to put in an index.
 */
export function isIndexableView(query: ListingQuery): boolean {
  return !readSearch(query.search);
}
