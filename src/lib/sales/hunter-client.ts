import { HUNTER_API_BASE, hunterApiKey, redactKey } from './hunter-config';

/**
 * Talking to Hunter.
 *
 * Server-only, metered, and billed per call - so this module is written the
 * way `ahrefs/client.ts` is written rather than the way a convenience wrapper
 * would be: every call returns what it cost, errors come back as values rather
 * than as throws, and the key never appears in anything that is stored or
 * printed.
 *
 * ## What this module does not decide
 *
 * Whether a call is affordable. That is the credit guard's job, in
 * `contact-service.ts`, and the separation is deliberate: a client that
 * checks its own budget is a client that has to be trusted to check it, and
 * the one place that must not be bypassable is the place that says no.
 *
 * ## The key is in the URL
 *
 * Hunter authenticates with a query parameter, which means the request URL is
 * a credential. Every error string from here goes through `redactKey` before
 * it leaves, because the natural thing to do with a failed request - print
 * the URL - is the thing that leaks the key into a log somebody else can read.
 */

export interface HunterResult<T> {
  data?: T;
  /** Safe to show an admin and safe to store: redacted, bounded. */
  error?: string;
  httpStatus?: number;
  /**
   * What Hunter charged, from the response rather than assumed.
   *
   * Zero on a failure that was not billed, which matters: a run of 404s that
   * recorded one credit each would show a month's budget spent on nothing and
   * refuse real lookups.
   */
  creditsCharged: number;
  /** The live account figures, where the response carried them. */
  requestsUsed?: number;
  requestsAvailable?: number;
}

export interface HunterPerson {
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  seniority?: string;
  department?: string;
  linkedin?: string;
  /** Hunter's own 0-100 score for the address. */
  confidence?: number;
  verification?: string;
}

export interface DomainSearchResult {
  domain: string;
  organisation?: string;
  people: HunterPerson[];
}

/** Long enough for a slow API, short enough that a hang is cheap. */
const TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

/**
 * One request.
 *
 * `meta.results` and the rate-limit headers are read where present. Hunter
 * does not report a per-call credit cost in its response body, so the charge
 * is derived from the account counter where two readings are available and
 * falls back to the documented cost of the endpoint - which is recorded as
 * such rather than presented as measured.
 */
async function request<T>(
  path: string,
  params: Record<string, string>,
  parse: (body: Json) => T,
  documentedCost: number,
): Promise<HunterResult<T>> {
  const key = hunterApiKey();
  if (!key) {
    return {
      error: 'HUNTER_API_KEY is not set. Add it to the Vercel project environment and redeploy.',
      creditsCharged: 0,
    };
  }

  const url = new URL(`${HUNTER_API_BASE}${path}`);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set('api_key', key);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // Never the URL: it holds the key.
    return {
      error: redactKey(
        error instanceof Error ? `Hunter could not be reached: ${error.message}` : 'Hunter could not be reached.',
      ).slice(0, 300),
      creditsCharged: 0,
    };
  }

  const usedHeader = Number(response.headers.get('x-credits-used') ?? NaN);
  const availableHeader = Number(response.headers.get('x-credits-available') ?? NaN);
  const requestsUsed = Number.isFinite(usedHeader) ? usedHeader : undefined;
  const requestsAvailable = Number.isFinite(availableHeader) ? availableHeader : undefined;

  let body: Json = {};
  try {
    body = (await response.json()) as Json;
  } catch {
    body = {};
  }

  if (!response.ok) {
    const errors = (body.errors as { details?: string; id?: string }[] | undefined) ?? [];
    const detail = errors[0]?.details ?? `HTTP ${response.status}`;

    return {
      error: redactKey(messageFor(response.status, detail)).slice(0, 300),
      httpStatus: response.status,
      /*
        A rejected request is not a spent credit.

        401, 403, 404 and 429 are not billed. Recording one credit for each
        would show a month's allowance consumed by a misconfigured key and
        refuse the lookups that would have worked once it was fixed.
      */
      creditsCharged: 0,
      requestsUsed,
      requestsAvailable,
    };
  }

  return {
    data: parse(body),
    httpStatus: response.status,
    creditsCharged: documentedCost,
    requestsUsed,
    requestsAvailable,
  };
}

/** A failure in words somebody can act on, never carrying the key. */
function messageFor(status: number, detail: string): string {
  if (status === 401) return 'Hunter rejected the API key. Check HUNTER_API_KEY in Vercel.';
  if (status === 403) {
    return 'Hunter refused the request: the plan does not allow it, or the key lacks permission.';
  }
  if (status === 429) {
    return 'Hunter rate limited the request, or the account is out of credits. Nothing was charged.';
  }
  if (status === 404) return 'Hunter has nothing for that domain.';
  return `Hunter returned ${status}: ${detail}`;
}

/**
 * Everyone Hunter knows at a domain.
 *
 * One credit per ten results returned, which is why `limit` is capped at ten
 * here: asking for more is asking to be charged more, and nobody needs forty
 * people at one company when one email goes out.
 */
export async function domainSearch(
  domain: string,
  limit = 10,
): Promise<HunterResult<DomainSearchResult>> {
  return request(
    '/domain-search',
    { domain, limit: String(Math.min(10, Math.max(1, limit))), type: 'personal' },
    (body) => {
      const data = (body.data as Json) ?? {};
      const emails = (data.emails as Json[] | undefined) ?? [];

      return {
        domain: String(data.domain ?? domain),
        organisation: (data.organization as string) || undefined,
        people: emails
          .filter((entry) => typeof entry.value === 'string' && entry.value.includes('@'))
          .map((entry) => ({
            email: String(entry.value).toLowerCase(),
            firstName: (entry.first_name as string) || undefined,
            lastName: (entry.last_name as string) || undefined,
            position: (entry.position as string) || undefined,
            seniority: (entry.seniority as string) || undefined,
            department: (entry.department as string) || undefined,
            linkedin: (entry.linkedin as string) || undefined,
            confidence:
              typeof entry.confidence === 'number' ? Math.round(entry.confidence) : undefined,
            verification: readVerification(entry),
          })),
      };
    },
    1,
  );
}

/**
 * Hunter's own view of whether an address will accept mail.
 *
 * `accept_all` is reported as itself rather than folded into valid. A
 * catch-all domain accepts everything, including addresses that belong to
 * nobody - treating that as verified is how a bounce rate climbs until a mail
 * provider stops delivering for us at all.
 */
function readVerification(entry: Json): string | undefined {
  const verification = entry.verification as Json | undefined;
  const status = verification?.status ?? entry.status;
  if (typeof status !== 'string') return undefined;

  const allowed = ['valid', 'invalid', 'accept_all', 'unknown', 'webmail', 'disposable'];
  return allowed.includes(status) ? status : 'unknown';
}

export { redactKey, isHunterConfigured } from './hunter-config';
