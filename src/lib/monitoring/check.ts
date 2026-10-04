import { verdictForNetworkError, verdictForPage, type CheckInput, type FetchedPage, type Verdict } from './verdict';

/**
 * Fetching the article, which is the only part that touches a network.
 *
 * Kept to itself so `verdictForPage` can be tested against every page shape
 * without one. The two are joined by `checkLink` and nowhere else.
 */

const TIMEOUT_MS = 15_000;

/**
 * Says who it is and how to complain.
 *
 * These are publishers we pay. A monitor that hides behind a browser string
 * gets treated as a scraper the day somebody looks at their logs, and the
 * relationship is worth more than the handful of extra responses the
 * disguise would win.
 */
export const USER_AGENT =
  'Mozilla/5.0 (compatible; PressParrotLinkMonitor/1.0; +https://pressparrot.com)';

/** A homepage is HTML. Reading past this is reading a payload, not a page. */
const MAX_BYTES = 600_000;

export async function fetchPage(url: string): Promise<FetchedPage> {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  // A non-HTML response has no links to find, and reading a PDF into memory to
  // discover that is wasteful. The verdict sees the empty body and the status.
  const type = headers['content-type'] ?? '';
  const html = type.includes('html') || type === '' ? (await response.text()).slice(0, MAX_BYTES) : '';

  return { finalUrl: response.url || url, status: response.status, headers, html };
}

/** One link, checked. Never throws: a failure is a verdict, not an exception. */
export async function checkLink(
  input: CheckInput,
  fetcher: (url: string) => Promise<FetchedPage> = fetchPage,
): Promise<{ verdict: Verdict; page?: FetchedPage }> {
  try {
    const page = await fetcher(input.placedUrl);
    return { verdict: verdictForPage(page, input), page };
  } catch (error) {
    return { verdict: verdictForNetworkError(error) };
  }
}
