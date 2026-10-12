import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { RATE_LIMITS, consumeRateLimit, rateLimitMessage } from '@/lib/auth/rate-limit';
import { domainKey } from '@/lib/planner/domain-key';
import { websiteService } from '@/lib/services/website-service';

/**
 * Looking a domain up in Press Parrot's own publisher table.
 *
 * ## This is a database read and nothing else
 *
 * No Ahrefs, no Majestic, no Moz, no SEMrush, no model, no fetch of any
 * kind. It asks `websites` whether we already hold a row for a domain the
 * customer typed, and returns four numbers and a date. Nothing is enriched,
 * nothing is scheduled, and no credit of any sort is spent. A domain we do
 * not hold produces "not found" rather than a lookup somewhere else.
 *
 * ## What comes back, named one at a time
 *
 * Four metrics and when they were last measured. The column list is an
 * allowlist in the `select`, not a filter applied afterwards, because the
 * `websites` row also carries things no customer may see and a filter is
 * one forgotten line away from shipping them. `service_costs`,
 * `website_contacts` and `website_commercials` are separate tables with no
 * customer-facing policy at all, so they are not reachable from here even
 * by accident - but `websites` is the one table where care is still needed.
 *
 * ## Why it is rate limited at all
 *
 * The figures are not secret - the marketplace shows them. What is worth
 * limiting is the shape: this is the only screen that will answer about a
 * domain nobody is buying, one domain per call, which is what walking an
 * inventory looks like. Sixty an hour per account is far more than filling
 * a spreadsheet needs and far less than enumerating anything with. The
 * counter is `consume_rate_limit`, which already exists and already does
 * the increment in one statement.
 */

export interface FoundMetrics {
  domainRating: number | null;
  organicTraffic: number | null;
  organicKeywords: number | null;
  referringDomains: number | null;
  /** When Ahrefs last refreshed the listing, so the age is the real age. */
  measuredAt: string | null;
}

export type LookupResult =
  | { kind: 'found'; domain: string; metrics: FoundMetrics }
  | { kind: 'not-found'; domain: string }
  | { kind: 'refused'; message: string };

/**
 * The same question, against the mock marketplace.
 *
 * Without this the lookup answered "not found" from a clone before
 * consulting anything, which made the one path worth demonstrating
 * impossible to demonstrate - and impossible to catch a mistake in. The
 * mock store holds the same four figures, so the behaviour a reviewer sees
 * locally is the behaviour production has.
 *
 * It reads the list item, which is already the redacted shape the
 * marketplace hands a customer, so no cost or contact can come through it
 * even by accident.
 */
async function fromMockStore(domain: string): Promise<FoundMetrics | null> {
  const preview = await websiteService.search(
    { search: domain, page: 1, pageSize: 5 },
    undefined,
  );
  const match = preview.items.find((item) => item.domain.toLowerCase() === domain);
  if (!match) return null;
  return {
    domainRating: match.metrics.domainRating,
    organicTraffic: match.metrics.organicTraffic,
    organicKeywords: match.metrics.organicKeywords ?? null,
    referringDomains: match.metrics.referringDomains,
    measuredAt: null,
  };
}

export const plannerMetrics = {
  /**
   * Which of these domains the marketplace actually sells.
   *
   * A badge, not a price. The planner shows that a domain can be bought
   * here and links to its listing; it never replaces what the customer
   * entered, because an agency may well have a better arrangement with
   * that publisher than our rate card offers, and a tool that quietly
   * rewrites their supplier and their price is not one they keep using.
   *
   * ## Two columns, and no rate limit
   *
   * `domain` and `slug` - the slug only so the badge can be a link to a
   * page that is already public. No price, no cost, no contact: the
   * allowlist is in the `select` for the same reason it is in `find`.
   *
   * Unlike `find` this is not charged against the lookup limit, and the
   * reason is what it can answer rather than politeness about page loads.
   * It says only whether a domain the customer has already typed into
   * their own plan is listed, which the marketplace's own search box
   * answers for any signed-in customer with no limit at all. A limit here
   * would throttle a page render while removing no capability. The cap is
   * still here, because a question about a thousand domains in one query
   * is a different thing from a badge.
   */
  async listingSlugs(domainKeys: string[], limit = 200): Promise<Map<string, string>> {
    const domains = [...new Set(domainKeys.map(domainKey).filter(Boolean))].slice(0, limit);
    const out = new Map<string, string>();
    if (domains.length === 0) return out;

    if (!isSupabaseEnabled()) {
      /* The same question against the mock marketplace, so the badge is
         demonstrable from a clone - `fromMockStore` exists for exactly
         this reason one function up. */
      for (const domain of domains) {
        const preview = await websiteService.search({ search: domain, page: 1, pageSize: 5 }, undefined);
        const match = preview.items.find((item) => item.domain.toLowerCase() === domain);
        if (match) out.set(domain, match.slug);
      }
      return out;
    }

    const { data } = await getAdminScopedClient()
      .from('websites')
      // The allowlist. The domain we asked about, and the public slug.
      .select('domain, slug')
      .in('domain', domains)
      .eq('status', 'active');

    for (const row of (data ?? []) as Record<string, unknown>[]) {
      out.set(String(row.domain), String(row.slug));
    }
    return out;
  },

  /**
   * One domain.
   *
   * The rate limit is counted before the read and against the account, not
   * the address: this is behind a session, so the account is the thing
   * worth limiting, and an IP-keyed count would throttle an agency office
   * sharing one address.
   */
  async find(userId: string, rawDomain: string): Promise<LookupResult> {
    const domain = domainKey(rawDomain);
    if (!domain) return { kind: 'not-found', domain: rawDomain };

    const throttle = await consumeRateLimit(RATE_LIMITS.plannerMetrics, userId);
    if (!throttle.allowed) return { kind: 'refused', message: rateLimitMessage(throttle) };

    if (!isSupabaseEnabled()) {
      const mock = await fromMockStore(domain);
      return mock ? { kind: 'found', domain, metrics: mock } : { kind: 'not-found', domain };
    }

    const { data } = await getAdminScopedClient()
      .from('websites')
      // The allowlist. Four metrics and a date; nothing else is asked for.
      .select('domain_rating, organic_traffic, organic_keywords, referring_domains, last_ahrefs_refresh_at')
      .eq('domain', domain)
      .eq('status', 'active')
      .maybeSingle();

    if (!data) return { kind: 'not-found', domain };

    const row = data as Record<string, unknown>;
    const n = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    return {
      kind: 'found',
      domain,
      metrics: {
        domainRating: n(row.domain_rating),
        organicTraffic: n(row.organic_traffic),
        organicKeywords: n(row.organic_keywords),
        referringDomains: n(row.referring_domains),
        measuredAt: (row.last_ahrefs_refresh_at as string | null) ?? null,
      },
    };
  },

  /**
   * Several at once, for a selection of rows.
   *
   * One query rather than one per row - `in (...)` against the indexed
   * `domain` column - and one rate-limit charge per domain asked about, so
   * a bulk lookup cannot be a way round the per-domain limit.
   *
   * Capped, because the cap is what stops "select all" on a thousand-row
   * month becoming a thousand-domain question.
   */
  async findMany(
    userId: string,
    rawDomains: string[],
    limit = 50,
  ): Promise<{ found: Map<string, FoundMetrics>; refused?: string }> {
    const domains = [...new Set(rawDomains.map(domainKey).filter(Boolean))].slice(0, limit);
    const found = new Map<string, FoundMetrics>();
    if (domains.length === 0) return { found };

    /* One charge per domain asked about, so a bulk lookup cannot be a way
       round the per-domain limit. Counted before the read, like every other
       limit here. */
    for (let charged = 0; charged < domains.length; charged += 1) {
      const throttle = await consumeRateLimit(RATE_LIMITS.plannerMetrics, userId);
      if (!throttle.allowed) return { found, refused: rateLimitMessage(throttle) };
    }

    if (!isSupabaseEnabled()) {
      for (const domain of domains) {
        const mock = await fromMockStore(domain);
        if (mock) found.set(domain, mock);
      }
      return { found };
    }

    const { data } = await getAdminScopedClient()
      .from('websites')
      .select('domain, domain_rating, organic_traffic, organic_keywords, referring_domains, last_ahrefs_refresh_at')
      .in('domain', domains)
      .eq('status', 'active');

    for (const entry of (data ?? []) as Record<string, unknown>[]) {
      const n = (value: unknown): number | null => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      found.set(String(entry.domain), {
        domainRating: n(entry.domain_rating),
        organicTraffic: n(entry.organic_traffic),
        organicKeywords: n(entry.organic_keywords),
        referringDomains: n(entry.referring_domains),
        measuredAt: (entry.last_ahrefs_refresh_at as string | null) ?? null,
      });
    }

    return { found };
  },
};
