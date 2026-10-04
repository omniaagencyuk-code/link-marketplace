/**
 * Comparing two URLs that mean the same page.
 *
 * A publisher links to `https://www.buyer.com/page/` and the order says
 * `http://buyer.com/page?utm_source=x`. Those are the same link to everybody
 * except a string comparison, and a monitor that reports the second as missing
 * raises a claim against a publisher who did exactly what they were paid for.
 *
 * So both sides are reduced to the part that identifies the page: host without
 * `www`, path without a trailing slash, and nothing else. Protocol, query and
 * hash all go - a tracking parameter is not a different page, and a site that
 * moves to https has not dropped the link.
 */

/** Host and path only, lowercased, with no www, trailing slash, query or hash. */
export function normaliseUrl(raw: string): string {
  const value = (raw ?? '').trim();
  if (!value) return '';

  let parsed: URL;
  try {
    // A bare `example.com/page` is a URL a human would write and `new URL`
    // rejects, so it gets a scheme before being parsed rather than discarded.
    parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return value.toLowerCase();
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');

  return `${host}${path}`;
}

/** Do these two URLs point at the same page? */
export function sameUrl(a: string, b: string): boolean {
  const left = normaliseUrl(a);
  return left !== '' && left === normaliseUrl(b);
}

/**
 * Is this URL a site's front page?
 *
 * Used for the redirect rule: an article that now answers on the homepage has
 * been taken down, and the homepage is standing in for it. A homepage that
 * redirects to a homepage has not, which is why this is asked of both ends.
 */
export function isHomepage(raw: string): boolean {
  const normalised = normaliseUrl(raw);
  return normalised !== '' && !normalised.includes('/');
}
