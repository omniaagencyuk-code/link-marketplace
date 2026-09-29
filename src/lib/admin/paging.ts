/**
 * Showing a long table a page at a time.
 *
 * Nine hundred and fifty rows in one list is a scroll bar the height of a
 * pencil lead and a browser that stutters every time a checkbox is ticked.
 * The marketplace has paged since it was built; the admin never did, because
 * it never had this many rows.
 *
 * Pure: the arithmetic of which rows and which page numbers, with no React in
 * it. The off-by-ones here are the kind that look right and are not.
 */

/** The choices offered, and the one used until somebody chooses. */
export const PAGE_SIZES = [25, 50, 100, 250] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** A page size of 0 means "all of them", which is a real answer for 30 rows. */
export type PageSize = (typeof PAGE_SIZES)[number] | 0;

export interface Paged<T> {
  rows: T[];
  /** 1-based, clamped into range. */
  page: number;
  pages: number;
  total: number;
  /** 1-based index of the first row shown, or 0 when there are none. */
  from: number;
  /** 1-based index of the last row shown. */
  to: number;
}

export function paginate<T>(items: readonly T[], page: number, size: PageSize): Paged<T> {
  const total = items.length;

  // Everything on one page. Not a special case to be avoided - it is what
  // somebody wants when they are about to select all of something.
  if (size === 0) {
    return { rows: [...items], page: 1, pages: 1, total, from: total ? 1 : 0, to: total };
  }

  const pages = Math.max(1, Math.ceil(total / size));
  /*
    Clamped rather than trusted.

    A filter that shrinks the list leaves the page number where it was, and
    page 12 of a 3-page list is an empty table with no way back to the rows -
    which reads as "no results" for a filter that matched plenty.
  */
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (current - 1) * size;
  const rows = items.slice(start, start + size);

  return {
    rows,
    page: current,
    pages,
    total,
    from: total ? start + 1 : 0,
    to: start + rows.length,
  };
}

/**
 * The page numbers to draw, with gaps where they are skipped.
 *
 * `null` is a gap. Nineteen pages laid out in full is a row of numbers
 * nobody reads; the first, the last, and a window around where you are is
 * what people actually navigate with.
 */
export function pageWindow(page: number, pages: number, around = 1): (number | null)[] {
  if (pages <= 1) return [1];

  const wanted = new Set<number>([1, pages]);
  for (let at = page - around; at <= page + around; at += 1) {
    if (at >= 1 && at <= pages) wanted.add(at);
  }

  const ordered = [...wanted].sort((a, b) => a - b);
  const out: (number | null)[] = [];

  for (const [index, number] of ordered.entries()) {
    const previous = ordered[index - 1];
    // A single missing number is printed rather than replaced by a gap: an
    // ellipsis standing for one page is wider than the page it hides.
    if (previous != null && number - previous > 1) {
      if (number - previous === 2) out.push(previous + 1);
      else out.push(null);
    }
    out.push(number);
  }

  return out;
}
