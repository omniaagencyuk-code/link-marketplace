import { AHREFS_API_BASE, AHREFS_MAX_BATCH, ahrefsToken } from './config';

/**
 * The Ahrefs endpoints the refresh uses.
 *
 * One batch-analysis call per 100 domains, which is Ahrefs' hard cap. Every
 * domain in the call is billed, and the price depends on the columns asked
 * for - which is why the cost is read back from the response rather than
 * calculated. The caller decides how many to send based on the budget.
 *
 * `mode: 'subdomains'` is deliberate and documented by Ahrefs: analysing a
 * bare domain name with `mode: 'domain'` silently excludes www and every other
 * subdomain, which understates traffic for most publishers.
 */

/** How many countries of traffic breakdown to ask for per domain. */
export const AHREFS_TOP_COUNTRIES = 3;

export interface AhrefsCountryTraffic {
  /** ISO 3166-1 alpha-2, uppercased. */
  country: string;
  traffic: number;
}

export interface AhrefsMetrics {
  domainRating: number;
  organicTraffic: number;
  /** Biggest first. Empty when Ahrefs returned no breakdown. */
  topCountries: AhrefsCountryTraffic[];
}

export interface BatchAnalysisResult {
  /** Keyed by the domain exactly as it was sent. */
  metrics: Map<string, AhrefsMetrics>;
  /** Targets Ahrefs returned nothing usable for. */
  missing: string[];
  /**
   * What Ahrefs charged for this call, as Ahrefs reported it.
   *
   * Null when the response carried no cost - the caller falls back to its
   * configured estimate rather than recording a spend of zero.
   */
  unitsCost: number | null;
}

export interface AhrefsUsage {
  /** Workspace-wide usage this billing month. */
  unitsUsed: number | null;
  /** Workspace allowance, or null when the plan is unmetered. */
  unitsLimit: number | null;
  /** Start of the next billing period, ISO. */
  resetDate: string | null;
  subscription: string | null;
}

interface AhrefsTargetRow {
  index?: number;
  url?: string;
  domain_rating?: number | null;
  org_traffic?: number | null;
  org_traffic_top_by_country?: [string, number][] | null;
}

export class AhrefsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AhrefsError';
  }
}

/**
 * The cost Ahrefs reported for a call.
 *
 * Ahrefs has carried this as a response header and as a sibling key in the
 * body at different times, so both are tried and neither is required. A
 * missing cost reads as null, never as free.
 */
function readUnitsCost(response: Response, payload: unknown): number | null {
  const fromBody = (payload as { apiUsageCosts?: Record<string, unknown> } | null)?.apiUsageCosts;
  const bodyValue = fromBody?.['units-cost-total-actual'] ?? fromBody?.['units_cost_total_actual'];
  if (typeof bodyValue === 'number' && Number.isFinite(bodyValue)) return bodyValue;

  for (const header of ['x-api-units-cost-total-actual', 'x-units-cost-total-actual']) {
    const raw = response.headers.get(header);
    if (raw == null) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }

  return null;
}

async function ahrefsFetch(path: string, init: RequestInit): Promise<Response> {
  const token = ahrefsToken();
  if (!token) throw new AhrefsError('AHREFS_API_TOKEN is not set');

  const response = await fetch(`${AHREFS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    // Ahrefs is occasionally slow on a full batch; better to fail the run than
    // to hold a serverless function open indefinitely.
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AhrefsError(
      `Ahrefs returned ${response.status}: ${body.slice(0, 300)}`,
      response.status,
    );
  }

  return response;
}

/**
 * The account's allowance and what has been spent against it.
 *
 * Free to call, and the only figure that accounts for everything else using
 * the same allowance. The refresh reads it before every run and prefers it to
 * its own arithmetic.
 */
export async function subscriptionInfo(): Promise<AhrefsUsage> {
  const response = await ahrefsFetch('/subscription-info/limits-and-usage', { method: 'GET' });
  const payload = (await response.json()) as {
    limits_and_usage?: {
      subscription?: string | null;
      units_limit_workspace?: number | null;
      units_usage_workspace?: number | null;
      usage_reset_date?: string | null;
    };
  };

  const info = payload.limits_and_usage ?? {};
  const reset = info.usage_reset_date ? new Date(info.usage_reset_date) : null;

  return {
    unitsUsed: typeof info.units_usage_workspace === 'number' ? info.units_usage_workspace : null,
    unitsLimit: typeof info.units_limit_workspace === 'number' ? info.units_limit_workspace : null,
    resetDate: reset && !Number.isNaN(reset.getTime()) ? reset.toISOString() : null,
    subscription: info.subscription ?? null,
  };
}

/**
 * Fetch domain rating, organic traffic and the top countries for up to 100
 * domains.
 *
 * Results are matched back by `index` rather than by URL. Ahrefs echoes the
 * target it resolved, which is not always the string that was sent, and
 * matching on that would quietly drop rows.
 */
export async function batchAnalysis(domains: string[]): Promise<BatchAnalysisResult> {
  if (domains.length === 0) return { metrics: new Map(), missing: [], unitsCost: 0 };
  if (domains.length > AHREFS_MAX_BATCH) {
    throw new AhrefsError(`Batch of ${domains.length} exceeds the limit of ${AHREFS_MAX_BATCH}`);
  }

  const response = await ahrefsFetch('/batch-analysis/batch-analysis', {
    method: 'POST',
    body: JSON.stringify({
      select: ['index', 'url', 'domain_rating', 'org_traffic', 'org_traffic_top_by_country'],
      // Without this the breakdown comes back with a single country, which
      // says nothing about how concentrated the audience is.
      top_countries: AHREFS_TOP_COUNTRIES,
      targets: domains.map((domain) => ({
        url: domain,
        mode: 'subdomains',
        protocol: 'both',
      })),
    }),
  });

  const payload = (await response.json()) as { targets?: AhrefsTargetRow[] };
  const rows = Array.isArray(payload.targets) ? payload.targets : [];

  const metrics = new Map<string, AhrefsMetrics>();

  for (const row of rows) {
    const domain =
      typeof row.index === 'number' && row.index >= 0 && row.index < domains.length
        ? domains[row.index]
        : undefined;
    if (!domain) continue;

    // A target Ahrefs has no data for comes back with nulls. That is not a
    // reading of zero and must not be written as one - the domain is left
    // alone and reported as missing so it stays due.
    if (row.domain_rating == null && row.org_traffic == null) continue;

    metrics.set(domain, {
      // Stored as an integer; Ahrefs returns a float.
      domainRating: Math.round(row.domain_rating ?? 0),
      organicTraffic: Math.round(row.org_traffic ?? 0),
      topCountries: parseTopCountries(row.org_traffic_top_by_country),
    });
  }

  return {
    metrics,
    missing: domains.filter((domain) => !metrics.has(domain)),
    unitsCost: readUnitsCost(response, payload),
  };
}

/** `[["us", 12000], ["gb", 3000]]` into something typed, biggest first. */
function parseTopCountries(raw: [string, number][] | null | undefined): AhrefsCountryTraffic[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (entry): entry is [string, number] =>
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        entry[0].length === 2 &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[1] > 0,
    )
    .map(([country, traffic]) => ({ country: country.toUpperCase(), traffic: Math.round(traffic) }))
    .sort((a, b) => b.traffic - a.traffic)
    .slice(0, AHREFS_TOP_COUNTRIES);
}
