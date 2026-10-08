/**
 * Fetching the listings a page actually needs, rather than all of them.
 *
 * The basket and the shortlist both live in the browser's local storage, so
 * the server cannot know which listings a page wants until the page has
 * hydrated and told it. Both pages solved that by shipping the entire active
 * inventory and letting the browser pick the eight rows it wanted out of it.
 *
 * That is fine at a few hundred listings and wrong at ten thousand, and ten
 * thousand is where this marketplace is heading: 3,405 listings are live and
 * 7,174 more are approved, priced and waiting to be published. The same shape
 * of mistake - many small requests, or one enormous one - is what had just
 * timed the pricing screen out.
 *
 * So the ids go up and the listings come back. The two constants below are
 * the only copy of the batching rule; the hook that chunks and the action that
 * enforces read the same numbers, because a client that batches at one size
 * against a server that caps at another is a silent truncation waiting for a
 * big enough shortlist.
 */

/**
 * Listings per request.
 *
 * Generous against a real basket - a £3,000 campaign is twenty or thirty
 * placements - and small enough that one request stays a small request.
 */
export const LISTINGS_PER_REQUEST = 100;

/**
 * Ids one page may ask about in total, across every batch.
 *
 * A bound rather than a guess at what is reasonable: without it a shortlist
 * of fifty thousand ids is fifty thousand ids, and the page that was supposed
 * to stop loading the whole inventory loads it again the long way round.
 */
export const MOST_LISTINGS_PER_PAGE = 1_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids worth asking the database about.
 *
 * Local storage is user-writable and survives schema changes, so what comes
 * out of it is input, not data: a stale key, a hand-edited array, a value
 * from two versions ago. Anything that is not a uuid is dropped here rather
 * than sent, deduped so a basket with the same site twice is one lookup, and
 * capped so the request stays bounded whatever the browser sends.
 */
export function listingIdsToFetch(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!UUID.test(trimmed)) continue;
    seen.add(trimmed.toLowerCase());
    if (seen.size >= MOST_LISTINGS_PER_PAGE) break;
  }
  return [...seen];
}
