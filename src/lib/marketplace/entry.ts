/**
 * The way in to the inventory, for a page that cannot know who is reading it.
 *
 * `/marketplace` and everything under `/websites` need an account:
 * `isInventoryPath` in `proxy.ts` is the gate, and it answers a request
 * without a session with a 307 to /signup carrying where they were headed.
 * That redirect is correct and it is not going anywhere - what it is not is
 * free, and a public page whose main button is a redirect is a page that
 * spends a round trip on every click of it.
 *
 * So public links say where they really go. One copy of that rule, here,
 * because the alternative is a dozen hand-written `/signup?next=...` strings
 * that each have to remember to encode the query.
 *
 * ## What this is not
 *
 * It is not the gate and must never be mistaken for one. `proxy.ts` decides
 * what a request without a session may have; nothing here is consulted for
 * that, and a page that linked straight at `/marketplace` would still be
 * stopped. This only decides what a link in public markup points at.
 *
 * ## Why a page cannot simply ask
 *
 * The marketing pages are statically rendered with a ten minute revalidate -
 * one copy served to everybody - so a link cannot be one thing for a visitor
 * with an account and another for a visitor without one. Signed out is the
 * larger audience on a marketing page by a wide margin, and the one being
 * asked to sign up, so the link is written for them. The exception is the
 * header's search box, which is drawn only when there is a session and so
 * can point straight at the marketplace.
 */

/** The roots behind the gate. The same two `isInventoryPath` names. */
const INVENTORY_ROOTS = ['/marketplace', '/websites'];

/**
 * Does this path lead at the inventory?
 *
 * Query and all: `/marketplace?niche=gambling` leads there exactly as
 * `/marketplace` does. The signup form uses this to decide whether to tell
 * somebody what their account unlocks, and it used to ask `next ===
 * '/marketplace'` - so every filtered link, which is most of them, lost the
 * one sentence explaining why the form was in front of them.
 */
export function leadsToInventory(path: string | null | undefined): boolean {
  if (typeof path !== 'string' || !path.startsWith('/')) return false;
  const pathname = path.split('?')[0] ?? '';
  return INVENTORY_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * The signup, carrying where the visitor was going.
 *
 * Encoded, because the target usually has a query of its own and a raw `?`
 * in a query value is the end of that value: `/signup?next=/marketplace?
 * niche=gambling` arrives as `next=/marketplace` with a stray `niche`
 * beside it, and the filter somebody chose is gone.
 *
 * `safeReturnPath` reads it back at the other end and refuses anything that
 * is not a path on this site, so this is a convenience rather than a
 * promise - it cannot be used to send somebody somewhere else.
 */
export function signupFor(target = '/marketplace'): string {
  return `/signup?next=${encodeURIComponent(target)}`;
}
