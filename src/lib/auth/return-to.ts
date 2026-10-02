/**
 * Where to send somebody after they sign in.
 *
 * A return URL arrives in a query string, which means it arrives from whoever
 * wrote the link. Unchecked, `?next=https://example.com/` turns our own signup
 * page into an open redirect: the victim sees a real Press Parrot URL, signs
 * in, and lands somewhere else entirely. So the only thing accepted is a path
 * on this site.
 *
 * `//evil.com` is the case worth naming, because it looks like a path and is
 * not - a browser reads a protocol-relative URL as another origin. A backslash
 * does the same thing in several browsers, which is why both are refused
 * rather than just the one everybody remembers.
 *
 * One copy, shared by the gate that writes these links and the two pages that
 * read them. It was three copies of one line, which is two opportunities for
 * them to stop agreeing about what is safe.
 */

/** A same-origin path to return to, or nothing. Never another origin. */
export function safeReturnPath(value: string | string[] | null | undefined): string | undefined {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : '';
  if (!raw) return undefined;

  const path = raw.trim();
  if (!path.startsWith('/')) return undefined;
  // `//host` and `/\host` are both read as another origin by a browser.
  if (path.startsWith('//') || path.startsWith('/\\')) return undefined;
  // A control character can be used to smuggle one of the above past a check
  // that only looks at the first two characters.
  if (/[\u0000-\u001f\u007f]/.test(path)) return undefined;

  return path;
}

/**
 * The path and query of a request, as a return URL.
 *
 * The query matters: somebody who followed a link to a filtered view of the
 * marketplace should land back on that view, not on an unfiltered one. The
 * gate dropped it, so `/websites?niche=technology` returned them to
 * `/websites`, and the filter they came for was gone.
 */
export function returnPathFor(pathname: string, search: string): string {
  return `${pathname}${search || ''}`;
}
