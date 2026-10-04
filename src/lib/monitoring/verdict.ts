import * as cheerio from 'cheerio';
import { isHomepage, normaliseUrl, sameUrl } from './url';

/**
 * Deciding whether a delivered link is still there.
 *
 * Pure: it takes a fetched response and returns a verdict. Nothing here opens
 * a socket, which is what lets every rule below be tested against the page
 * shape that triggers it rather than against a site that happens to be broken
 * today.
 *
 * ## Hard and soft, and why the difference is the whole design
 *
 * A hard failure is a real problem with the placement: the article is gone,
 * the link was removed, it was turned into a nofollow. Those cost a publisher
 * a claim.
 *
 * A soft failure is our inability to see: a challenge page, a rate limit, a
 * timeout. The link may be perfectly fine behind it. Soft failures must never
 * mark a link lost, because the alternative is raising claims against
 * publishers whose only offence is a strict firewall - and a guarantee that
 * fires on our own blind spots is worse than no guarantee.
 */

export type VerdictKind = 'ok' | 'hard' | 'soft';

export interface Verdict {
  kind: VerdictKind;
  /** Short, written to be read by a human in the admin list. */
  reason: string;
}

export interface FetchedPage {
  /** Where the request ended up, after redirects. */
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  html: string;
}

export interface CheckInput {
  placedUrl: string;
  targetUrl: string;
  expectsDofollow: boolean;
}

const ok = (reason = 'Link is live'): Verdict => ({ kind: 'ok', reason });
const hard = (reason: string): Verdict => ({ kind: 'hard', reason });
const soft = (reason: string): Verdict => ({ kind: 'soft', reason });

/** A network failure, before any response existed. */
export function verdictForNetworkError(error: unknown): Verdict {
  const message = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code ?? '';

  /*
    A domain that no longer resolves is the publisher's site being gone, which
    is as hard a failure as a 404. Every other network error - a timeout, a
    reset, a bad certificate - is us failing to see, not them failing to host.
  */
  if (code === 'ENOTFOUND' || /ENOTFOUND|getaddrinfo/i.test(message)) {
    return hard('The domain no longer resolves');
  }
  if (/abort|timeout|timed out/i.test(message)) return soft('The request timed out');
  return soft(`Could not reach the page: ${message.slice(0, 120)}`);
}

/** Is this response a challenge page rather than the article? */
function isChallenge(page: FetchedPage, title: string): boolean {
  // Cloudflare says so in a header when it serves one.
  if (page.headers['cf-mitigated']) return true;
  return /just a moment|checking your browser|attention required|verifying you are human/i.test(title);
}

function headerValue(headers: Record<string, string>, name: string): string {
  return headers[name.toLowerCase()] ?? '';
}

/**
 * The verdict for a page that was fetched.
 *
 * Soft checks come first: a 403 that happens to be a challenge page should be
 * reported as a challenge, and a page we were never shown cannot be judged for
 * its links.
 */
export function verdictForPage(page: FetchedPage, input: CheckInput): Verdict {
  // ------------------------------------------------------------- status code
  if (page.status === 404 || page.status === 410) {
    return hard(`The article returned ${page.status}`);
  }
  if (page.status === 401 || page.status === 403 || page.status === 429) {
    return soft(`Blocked from reading the page (${page.status})`);
  }
  if (page.status >= 500) return soft(`The site returned ${page.status}`);

  const $ = cheerio.load(page.html || '');
  const title = $('title').first().text().trim();

  if (isChallenge(page, title)) {
    return soft('A bot challenge was served instead of the article');
  }

  if (page.status >= 300 || page.status < 200) {
    return soft(`Unexpected response (${page.status})`);
  }

  /*
    ------------------------------------------------------- redirected home

    An article that now answers on the front page has been taken down and the
    homepage is standing in for it - a very common way for a placement to
    disappear quietly. Only when the article was not itself a homepage, or
    every link bought on a site's front page would fail.
  */
  if (!isHomepage(input.placedUrl) && isHomepage(page.finalUrl) && !sameUrl(page.finalUrl, input.placedUrl)) {
    return hard('The article redirects to the homepage');
  }

  // ------------------------------------------------------------- noindex
  const robotsHeader = headerValue(page.headers, 'x-robots-tag');
  if (/noindex/i.test(robotsHeader)) {
    return hard('The page is served with a noindex header');
  }

  const metaRobots = $('meta[name="robots"], meta[name="googlebot"]')
    .map((_, element) => $(element).attr('content') ?? '')
    .get()
    .join(' ');
  if (/noindex/i.test(metaRobots)) {
    return hard('The page is marked noindex');
  }

  /*
    ------------------------------------------------------------- canonical

    A canonical pointing somewhere else tells search engines to credit that
    page instead, which removes the value of the link while leaving it visible.
    A self-referencing canonical is normal and is not a failure.
  */
  const canonical = $('link[rel="canonical"]').first().attr('href') ?? '';
  if (canonical.trim()) {
    const resolved = resolveAgainst(canonical, page.finalUrl);
    if (!sameUrl(resolved, page.finalUrl) && !sameUrl(resolved, input.placedUrl)) {
      return hard(`The page canonicalises to ${normaliseUrl(resolved)}`);
    }
  }

  // ------------------------------------------------------------- the link
  const matching = $('a[href]')
    .filter((_, element) => sameUrl($(element).attr('href') ?? '', input.targetUrl))
    .toArray();

  if (matching.length === 0) {
    return hard('No link to the target URL was found on the page');
  }

  if (!input.expectsDofollow) return ok();

  /*
    Every matching link, not any of them.

    A page carrying both a followed and a nofollowed link to the same target
    still passes the value the buyer paid for, so this fails only when all of
    them are marked.
  */
  const allMarked = matching.every((element) => {
    const rel = ($(element).attr('rel') ?? '').toLowerCase();
    return /\b(nofollow|sponsored|ugc)\b/.test(rel);
  });

  if (allMarked) {
    return hard('The link is marked nofollow, sponsored or ugc');
  }

  return ok();
}

/** A possibly-relative href as an absolute URL. */
function resolveAgainst(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
