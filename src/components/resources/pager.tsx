import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { listingHref, type ListingQuery } from '@/lib/blog/listing';

/**
 * Pagination, as links.
 *
 * Every page of the archive is a URL a crawler can follow and a reader can
 * share, which is the whole reason this is not a "load more" button: a
 * button leaves pages two onward reachable only by someone who clicked, and
 * an archive nothing links to is an archive nothing indexes.
 *
 * `listingHref` builds the URLs, the same function the canonical tag and the
 * pills use, so a page's address and the address it declares as its own
 * cannot disagree.
 */
export function Pager({
  query,
  page,
  pageCount,
}: {
  /** The view being paged - its category and search ride along. */
  query: ListingQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const numbers = pageNumbers(page, pageCount);

  return (
    <nav aria-label="Article pages" className="mt-12 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={listingHref({ ...query, page: page - 1 })} rel="prev" className={STEP}>
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </Link>
      ) : (
        <span className={`${STEP} cursor-default opacity-40`} aria-hidden="true">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">Previous</span>
        </span>
      )}

      <ul className="flex items-center gap-1">
        {numbers.map((entry, index) =>
          entry === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1.5 text-[13px] text-muted">
              …
            </li>
          ) : (
            <li key={entry}>
              <Link
                href={listingHref({ ...query, page: entry })}
                aria-current={entry === page ? 'page' : undefined}
                aria-label={`Page ${entry}`}
                className={
                  entry === page
                    ? 'tabular flex h-9 min-w-9 items-center justify-center rounded-full bg-accent-700 px-3 text-[13px] font-semibold text-white'
                    : 'tabular flex h-9 min-w-9 items-center justify-center rounded-full border border-line-strong bg-white px-3 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-300 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none'
                }
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>

      {page < pageCount ? (
        <Link href={listingHref({ ...query, page: page + 1 })} rel="next" className={STEP}>
          <span className="sr-only sm:not-sr-only">Next</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <span className={`${STEP} cursor-default opacity-40`} aria-hidden="true">
          <span className="sr-only sm:not-sr-only">Next</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </nav>
  );
}

const STEP =
  'inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-300 hover:text-accent-700 focus-visible:ring-2 focus-visible:ring-accent-200 focus-visible:outline-none';

/**
 * Which page numbers to draw: the first, the last, and the ones either side
 * of where the reader is, with `null` where a run was left out.
 *
 * Exported so `verify:resources` can check the shape rather than the pixels
 * - an archive of forty pages should not print forty links, and an archive
 * of three should not print an ellipsis between two of them.
 */
export function pageNumbers(page: number, pageCount: number): (number | null)[] {
  const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((entry) => entry >= 1 && entry <= pageCount).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const entry of pages) {
    if (previous && entry - previous > 1) out.push(null);
    out.push(entry);
    previous = entry;
  }
  return out;
}
