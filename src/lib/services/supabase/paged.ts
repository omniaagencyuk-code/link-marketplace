/**
 * Reading every row a query matches, rather than the first page of them.
 *
 * PostgREST caps what one request returns. The cap is a server setting, it is
 * a thousand rows on a Supabase project by default, and nothing in the
 * response says it was applied - a query asking for two thousand rows comes
 * back with a thousand and no error. Every count derived from that array is
 * then wrong, quietly, and stays wrong as the inventory grows past it.
 *
 * That is not hypothetical here. The admin websites table read with
 * `.limit(2000)` and showed "1000 websites" against a larger inventory; the
 * public marketplace showed the first thousand by domain rating and hid the
 * rest from buyers; the niche counts on the homepage were counted from the
 * same truncated array.
 *
 * ## Two properties, and both were got wrong before this existed
 *
 * **It advances by what arrived, not by what it asked for.** Asking for a
 * thousand and being given a hundred, then asking for the next thousand,
 * skips nine hundred rows. The loop moves on by the length of the page it
 * actually received, so any server cap is handled rather than assumed.
 *
 * **It never returns a short answer quietly.** An error throws. Running past
 * the sanity ceiling throws. A caller gets every row or an exception - never
 * a plausible-looking array that is missing the end of the table.
 *
 * ## The order has to be total
 *
 * Paging by offset over `order by domain_rating desc` walks an order the
 * database is free to break ties in differently on each request, so rows are
 * skipped and others arrive twice. Every caller here orders by something
 * unique as well - `id` - which is what makes the walk stable.
 */

/** How many rows to ask for at a time. The server may give fewer. */
const PAGE = 500;

/**
 * More rows than this repository ever expects, by a wide margin.
 *
 * Here to stop a pathological loop rather than to limit anything real, and it
 * throws rather than returning what it has: a silent cap is the bug this file
 * exists to remove, and reintroducing one at a higher number would be the
 * same bug with more patience.
 */
const CEILING = 100_000;

interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

export async function readAllPages<T>(
  what: string,
  build: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<T[]> {
  const all: T[] = [];

  for (let from = 0; ; ) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load ${what}: ${error.message}`);

    const rows = (data ?? []) as T[];
    if (rows.length === 0) return all;

    all.push(...rows);
    // By what arrived. A server that returns fewer rows than were asked for
    // is the normal case, not the exceptional one.
    from += rows.length;

    if (all.length > CEILING) {
      throw new Error(
        `Refusing to keep reading ${what}: more than ${CEILING} rows. ` +
          'Something is wrong, or this read needs to stop being a full read.',
      );
    }
  }
}
