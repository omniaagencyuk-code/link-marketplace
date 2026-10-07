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
  /**
   * Unique domains linking to the target, where Ahrefs reported it.
   *
   * Undefined rather than zero when it did not. The marketplace shows this
   * figure beside domain rating and buyers filter on it, so a missing reading
   * written as zero is a listing that looks like it has no backlink profile at
   * all - which is what was happening, because this was never asked for and
   * the column kept whatever the CSV import left in it.
   */
  referringDomains?: number;
  /**
   * Keywords the target ranks for in the top 100 organic results.
   *
   * Undefined rather than zero when Ahrefs did not report one, for the same
   * reason as `referringDomains` above: "ranks for 0 keywords" is a claim
   * about the site, and a missing reading is a claim about our data.
   *
   * Free to collect. It is a column on this same request, and the endpoint is
   * priced by metric group rather than by column - `org_traffic` has already
   * paid for the organic group, so the current select and the select with this
   * added both cost 90 units per domain, measured against the live API.
   */
  organicKeywords?: number;
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
  refdomains?: number | null;
  org_keywords?: number | null;
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
      /*
        `refdomains` is on this same request, so asking for it is a column on a
        call already being made rather than another call. It was missing, and
        the consequence was visible: every listing kept whatever referring
        domain count the CSV import gave it - zero for most of them - while
        domain rating and traffic updated around it, so a refreshed listing
        read as a site with traffic and no backlinks.
      */
      select: [
        'index',
        'url',
        'domain_rating',
        'org_traffic',
        'org_traffic_top_by_country',
        'refdomains',
        // Free: see the note on `organicKeywords` above.
        'org_keywords',
      ],
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
    if (
      row.domain_rating == null &&
      row.org_traffic == null &&
      row.refdomains == null &&
      row.org_keywords == null
    ) {
      continue;
    }

    metrics.set(domain, {
      // Stored as an integer; Ahrefs returns a float.
      domainRating: Math.round(row.domain_rating ?? 0),
      organicTraffic: Math.round(row.org_traffic ?? 0),
      // Left undefined when Ahrefs said nothing, for the same reason the row
      // above is skipped entirely when it said nothing at all: absence of a
      // reading is not a reading of zero.
      ...(row.refdomains == null ? {} : { referringDomains: Math.round(row.refdomains) }),
      ...(row.org_keywords == null ? {} : { organicKeywords: Math.round(row.org_keywords) }),
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

/**
 * The referring domains for one target.
 *
 * Priced per row per column, measured against the live API rather than taken
 * from documentation:
 *
 *   units-cost-row   = the number of columns selected
 *   units-cost-total = max(50, rows x columns)
 *
 * So the three choices below are each a cost decision, not a style one.
 *
 * **One column.** `domain` and nothing else. Domain rating and traffic are a
 * unit a row each, and we already hold both for every site in our own
 * inventory - which is the only part of a gap we can sell. Adding either
 * would double or triple the bill to buy figures we have, for domains we
 * cannot offer.
 *
 * **A row cap, always.** The bill is otherwise the target's whole backlink
 * profile, and in a gap report the customer chooses the target. Sorted by
 * domain rating so a capped pull is the strongest N rather than an arbitrary
 * N.
 *
 * **`history=live`.** The default is `all_time`, which includes links that
 * have since been lost: more rows, so more units, for a worse answer.
 *
 * `mode=subdomains` because Ahrefs documents that `domain` excludes www and
 * other subdomains - which would silently drop a chunk of any real profile.
 *
 * The path is `site-explorer/refdomains`, taken from Ahrefs' own MCP client
 * rather than guessed from the endpoint's name: the plural-noun pattern here
 * is not consistent (`linkeddomains` has no hyphen, `best-by-external-links`
 * is nothing like its tool name), so a path inferred from the tool name would
 * have been a 404 on the first real report.
 */
export interface RefdomainsResult {
  domains: string[];
  /** What Ahrefs charged, read back from the response. Null means unknown. */
  unitsCost: number | null;
  /** True when the cap was hit, so this is the strongest N rather than all. */
  truncated: boolean;
}

export async function referringDomains(
  target: string,
  rowCap: number,
): Promise<RefdomainsResult> {
  const limit = Math.max(1, Math.floor(rowCap));

  const params = new URLSearchParams({
    target,
    select: 'domain',
    mode: 'subdomains',
    history: 'live',
    order_by: 'domain_rating:desc',
    limit: String(limit),
    output: 'json',
  });

  const response = await ahrefsFetch(`/site-explorer/refdomains?${params.toString()}`, {
    method: 'GET',
  });

  const payload = (await response.json()) as {
    refdomains?: { domain?: string | null }[];
  };

  const rows = payload.refdomains ?? [];
  const domains = rows
    .map((row) => (typeof row.domain === 'string' ? row.domain.trim().toLowerCase() : ''))
    .filter(Boolean);

  return {
    domains,
    unitsCost: readUnitsCost(response, payload),
    /*
      A full page is assumed truncated.

      Ahrefs does not say whether more existed, and the distinction matters to
      the report rather than to the bill: a gap computed from the strongest
      2,500 is a different claim from one computed from all of them, and the
      page says which it is.
    */
    truncated: rows.length >= limit,
  };
}

/**
 * Who else ranks for what this site ranks for.
 *
 * Ahrefs' organic competitors, used to fill in the competitor boxes on a gap
 * report rather than leaving the customer to guess. Measured against the free
 * `ahrefs.com` target with exactly the select below:
 *
 *   rows 8, units-cost-row 3, units-cost-total 50
 *
 * Eight rows at three columns is twenty-four, floored at fifty - so this costs
 * the per-request floor and nothing more, against the 2,500 one referring
 * domain pull costs. Suggesting is therefore effectively free, and that is the
 * argument for doing it here rather than asking a model: a model cannot know
 * who ranks for what and would name plausible companies instead. An invented
 * competitor is not merely a wrong answer - it is a real 2,500-unit pull
 * against a site nobody competes with.
 *
 * Three columns, all unsurcharged. `traffic` and the keyword-difficulty
 * columns are ten units a row each; `keywords_common` and `domain_rating` are
 * not, and between them they say both how close a rival is and whether the
 * suggestion is worth taking.
 *
 * `country` and `date` are required by the endpoint, and the country is a real
 * choice rather than a formality: a UK affiliate and a US one ranking for the
 * same terms have different rivals.
 *
 * The path is `site-explorer/organic-competitors`, read out of Ahrefs' own MCP
 * client rather than inferred from the tool name, for the reason written
 * against `referringDomains` above.
 */
export interface CompetitorRow {
  domain: string;
  /** Keywords this site and the target both rank for. The closeness measure. */
  keywordsCommon: number;
  domainRating: number;
}

export interface CompetitorSuggestionResult {
  competitors: CompetitorRow[];
  /** What Ahrefs charged, read back from the response. Null means unknown. */
  unitsCost: number | null;
}

export async function organicCompetitors(
  target: string,
  country: string,
  limit: number,
): Promise<CompetitorSuggestionResult> {
  const params = new URLSearchParams({
    target,
    select: 'competitor_domain,keywords_common,domain_rating',
    mode: 'subdomains',
    country: country.toLowerCase(),
    // Today. The endpoint reports on a date rather than "latest", and asking
    // for a date Ahrefs has no snapshot for returns the nearest it has.
    date: new Date().toISOString().slice(0, 10),
    order_by: 'keywords_common:desc',
    limit: String(Math.max(1, Math.floor(limit))),
    output: 'json',
  });

  const response = await ahrefsFetch(`/site-explorer/organic-competitors?${params.toString()}`, {
    method: 'GET',
  });

  const payload = (await response.json()) as {
    competitors?: {
      competitor_domain?: string | null;
      keywords_common?: number | null;
      domain_rating?: number | null;
    }[];
  };

  const competitors: CompetitorRow[] = (payload.competitors ?? [])
    .filter((row) => typeof row.competitor_domain === 'string' && row.competitor_domain.trim())
    .map((row) => ({
      domain: String(row.competitor_domain).trim().toLowerCase(),
      keywordsCommon: Math.round(row.keywords_common ?? 0),
      domainRating: Math.round(row.domain_rating ?? 0),
    }));

  return { competitors, unitsCost: readUnitsCost(response, payload) };
}
