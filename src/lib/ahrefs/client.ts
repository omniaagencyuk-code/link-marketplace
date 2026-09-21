import { AHREFS_API_BASE, AHREFS_MAX_BATCH, ahrefsToken } from './config';

/**
 * The Ahrefs batch-analysis endpoint.
 *
 * One call per 100 domains, which is Ahrefs' hard cap. Each domain in the call
 * is billed, so a batch of 100 costs 100x the per-domain rate - the caller
 * decides how many to send based on what is left in the budget.
 *
 * `mode: 'subdomains'` is deliberate and documented by Ahrefs: analysing a
 * bare domain name with `mode: 'domain'` silently excludes www and every other
 * subdomain, which understates traffic for most publishers.
 */

export interface AhrefsMetrics {
  domainRating: number;
  organicTraffic: number;
}

export interface BatchAnalysisResult {
  /** Keyed by the domain exactly as it was sent. */
  metrics: Map<string, AhrefsMetrics>;
  /** Targets Ahrefs returned nothing usable for. */
  missing: string[];
}

interface AhrefsTargetRow {
  index?: number;
  url?: string;
  domain_rating?: number | null;
  org_traffic?: number | null;
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
 * Fetch domain rating and organic traffic for up to 100 domains.
 *
 * Results are matched back by `index` rather than by URL. Ahrefs echoes the
 * target it resolved, which is not always the string that was sent, and
 * matching on that would quietly drop rows.
 */
export async function batchAnalysis(domains: string[]): Promise<BatchAnalysisResult> {
  const token = ahrefsToken();
  if (!token) throw new AhrefsError('AHREFS_API_TOKEN is not set');
  if (domains.length === 0) return { metrics: new Map(), missing: [] };
  if (domains.length > AHREFS_MAX_BATCH) {
    throw new AhrefsError(`Batch of ${domains.length} exceeds the limit of ${AHREFS_MAX_BATCH}`);
  }

  const response = await fetch(`${AHREFS_API_BASE}/batch-analysis/batch-analysis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      select: ['index', 'url', 'domain_rating', 'org_traffic'],
      targets: domains.map((domain) => ({
        url: domain,
        mode: 'subdomains',
        protocol: 'both',
      })),
    }),
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
    });
  }

  return {
    metrics,
    missing: domains.filter((domain) => !metrics.has(domain)),
  };
}
