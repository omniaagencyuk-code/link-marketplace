import { JWT } from 'google-auth-library';
import { GMAIL_API_BASE, GMAIL_SCOPE, serviceAccountKey } from './config';
import type { GmailThread } from './thread';

/**
 * Talking to Gmail as one of our own mailboxes.
 *
 * Read only, one mailbox at a time, and never on behalf of an address the
 * caller chose: impersonation is granted by the allowlist in the database and
 * checked before anything here is called. This module assumes that check has
 * already happened and does not perform it, which is why nothing exported
 * from here takes an address from a request.
 *
 * Two shapes of failure matter and are kept apart. `GmailError.retryable`
 * means the request may work later (429, 5xx, a socket that died); anything
 * else means it never will (a bad query, a revoked grant), and retrying it
 * wastes a chunk's budget on the same refusal.
 */

export class GmailError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * What went wrong, in words safe to store and show.
 *
 * Google's error bodies are long, quote the request, and on an auth failure
 * can echo parts of the assertion we signed. Job rows are read in the admin
 * and kept for months, so the body is reduced to the few known cases plus a
 * bare status. The full text never leaves this function.
 */
function describe(status: number, body: string): string {
  if (body.includes('unauthorized_client')) {
    return 'Domain-wide delegation is not set up for this service account, or the gmail.readonly scope is missing. See docs/gmail-import-setup.md.';
  }
  if (status === 403 && body.includes('accessNotConfigured')) {
    return 'The Gmail API is not enabled on the Google Cloud project.';
  }
  if (status === 403) return 'Gmail refused the request (403). Check the mailbox exists and delegation covers its domain.';
  if (status === 404) return 'Gmail found nothing at that address (404).';
  if (status === 429) return 'Gmail is rate limiting this account (429).';
  if (status >= 500) return `Gmail returned a server error (${status}).`;
  return `Gmail refused the request (${status}).`;
}

const RETRYABLE = new Set([403, 429, 500, 502, 503, 504]);

/**
 * 403 is in that set, but only sometimes.
 *
 * Google uses 403 both for "you may never do this" and for
 * rateLimitExceeded / userRateLimitExceeded, which are ordinary backpressure.
 * Retrying a permission error is pointless and retrying backpressure is the
 * whole job, so the body decides.
 */
function retryable(status: number, body: string): boolean {
  if (status === 403) return body.includes('ateLimitExceeded') || body.includes('quotaExceeded');
  return RETRYABLE.has(status);
}

/** An access token for one mailbox. Cached for its lifetime, then dropped. */
const tokenCache = new Map<string, { token: string; expires: number }>();

async function accessToken(mailbox: string): Promise<string> {
  const cached = tokenCache.get(mailbox);
  // A minute of headroom: a token that expires mid-chunk fails the chunk.
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const key = serviceAccountKey();
  if (!key) throw new GmailError('GOOGLE_SERVICE_ACCOUNT_KEY_B64 is not set on this deployment.', 0, false);

  const jwt = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [GMAIL_SCOPE],
    // This is the impersonation. Everything else is ordinary OAuth.
    subject: mailbox,
  });

  try {
    const { access_token: token } = await jwt.authorize();
    if (!token) throw new GmailError('Google returned no access token.', 0, false);
    // One hour is Google's default; the library reports the real expiry.
    tokenCache.set(mailbox, { token, expires: Date.now() + 55 * 60_000 });
    return token;
  } catch (error) {
    // The library puts the response body on the error. It can contain the
    // assertion, so only the recognised cases are reported.
    const text = error instanceof Error ? error.message : '';
    throw new GmailError(describe(401, text), 401, false);
  }
}

/** Wait, with jitter, so a chunk's retries do not all return together. */
function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 16_000);
  return base / 2 + Math.random() * (base / 2);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Gmail request, retried while retrying can help.
 *
 * `attempts` counts total tries, not retries. Four is roughly fifteen seconds
 * of waiting in the worst case, which fits inside a chunk without putting the
 * invocation near its limit.
 */
async function request<T>(mailbox: string, path: string, attempts = 4): Promise<T> {
  let lastError: GmailError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(backoffMs(attempt));

    let response: Response;
    try {
      const token = await accessToken(mailbox);
      response = await fetch(`${GMAIL_API_BASE}/users/me${path}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
    } catch (error) {
      // A dead socket is worth another go; the message is ours, not Google's.
      lastError = new GmailError(
        error instanceof Error && error.name === 'AbortError'
          ? 'The request to Gmail timed out.'
          : 'The request to Gmail could not be completed.',
        0,
        true,
      );
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    const body = await response.text().catch(() => '');
    const error = new GmailError(describe(response.status, body), response.status, retryable(response.status, body));
    if (!error.retryable) throw error;
    lastError = error;

    // An expired or revoked token will not be fixed by waiting.
    if (response.status === 401) tokenCache.delete(mailbox);
  }

  throw lastError ?? new GmailError('Gmail could not be reached.', 0, true);
}

// ------------------------------------------------------------------- listing

export interface ThreadRef {
  id: string;
  historyId?: string;
}

/**
 * Thread IDs matching a query, up to a cap.
 *
 * Cheap: the list endpoint returns IDs and history IDs, never bodies, so a
 * preview can count what a query would pull without fetching or paying for
 * any of it.
 */
export async function listThreads(
  mailbox: string,
  query: string,
  cap: number,
  labelIds?: string[],
): Promise<ThreadRef[]> {
  const found: ThreadRef[] = [];
  let pageToken: string | undefined;

  while (found.length < cap) {
    const params = new URLSearchParams({
      maxResults: String(Math.min(500, cap - found.length)),
    });
    if (query.trim()) params.set('q', query.trim());
    for (const label of labelIds ?? []) params.append('labelIds', label);
    if (pageToken) params.set('pageToken', pageToken);

    const page = await request<{
      threads?: { id?: string; historyId?: string }[];
      nextPageToken?: string;
    }>(mailbox, `/threads?${params.toString()}`);

    for (const thread of page.threads ?? []) {
      if (!thread.id) continue;
      found.push({ id: thread.id, historyId: thread.historyId ? String(thread.historyId) : undefined });
      if (found.length >= cap) break;
    }

    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }

  return found;
}

/** One thread, whole. This is the call that costs time. */
export async function getThread(mailbox: string, threadId: string): Promise<GmailThread> {
  return request<GmailThread>(mailbox, `/threads/${encodeURIComponent(threadId)}?format=full`);
}

/** The labels in a mailbox, so the filter can offer real ones. */
export async function listLabels(mailbox: string): Promise<{ id: string; name: string }[]> {
  const page = await request<{ labels?: { id?: string; name?: string }[] }>(mailbox, '/labels');
  return (page.labels ?? [])
    .filter((label) => label.id && label.name)
    .map((label) => ({ id: label.id!, name: label.name! }));
}

// --------------------------------------------------------------- concurrency

/**
 * Run tasks a few at a time.
 *
 * Gmail's per-user limit is generous but not unlimited, and five parallel
 * thread fetches is comfortably inside it while still being five times faster
 * than a loop. Results keep their input order so a caller can pair them back
 * up with what it asked for.
 */
export async function inParallel<In, Out>(
  items: In[],
  limit: number,
  run: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> {
  const results = new Array<Out>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}
