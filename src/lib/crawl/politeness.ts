import { brand } from '@/lib/config/brand';

/**
 * How we behave on somebody else's server.
 *
 * These were arrived at twice - `sales-research-service.ts` says in its own
 * header that its constants are "the same ones `site-description-service.ts`
 * arrived at" - and a third copy was about to be written for reading
 * publishers' homepages. Three copies of a politeness rule is two chances to
 * tighten one and leave the others hammering.
 *
 * The values are unchanged from both. A burst of hundreds of simultaneous
 * requests from one address is how a crawler gets blocked; a bot that will
 * not say who it is gets blocked by anybody paying attention. Twelve seconds
 * each, eight at a time, and a user-agent with our name and a URL in it so
 * whoever reads their logs can find out who we are.
 *
 * Only the constants live here. The fetches themselves stay with their
 * callers, which want different things back from a response - a prospect
 * page carries the links it found, a homepage read does not.
 */

export const FETCH_TIMEOUT_MS = 12_000;

/** Concurrent requests across different hosts. Never two at once to one. */
export const FETCH_AT_ONCE = 8;

export const CRAWLER_USER_AGENT =
  `Mozilla/5.0 (compatible; ${brand.name.replace(/\s+/g, '')}Bot/1.0; +https://pressparrot.com/)`;
