# Press Parrot MCP — V1 (read-only, anti-harvesting first)

## Context

Press Parrot wants customers to research link campaigns from Claude/ChatGPT via a
remote MCP server, **without** that becoming an export route for the publisher
inventory — which is the commercially valuable asset. Two hard constraints shape
every decision below: the live site must not get slower or less stable, and a
determined authenticated customer must not be able to reconstruct the marketplace.

Everything below is grounded in what I measured in this repo and in the MCP spec,
not in assumption. The findings that overturned my priors are flagged **⚠**.

---

## What I found (the facts the design rests on)

### Isolation is already available for free
`src/proxy.ts` matches only `/admin`, `/marketplace`, `/websites`, `/dashboard`.
**`/api/**` bypasses the proxy entirely.** An MCP endpoint under `/api/mcp` runs
no website middleware, no page rendering, and on Vercel is its own serverless
function. `vercel.json` has no `functions` block — per-route config lives in the
route file (`maxDuration`, `dynamic`), exactly as the 11 cron routes do.

### ⚠ RLS does not protect the marketplace
`0006_gate_marketplace.sql`: `"Signed-in users read active websites" … to authenticated using (status = 'active' or is_admin())`.
Any signed-in customer can already read **every column of every active row**.
So the anti-harvesting controls cannot lean on RLS at all — they must live in the
MCP service layer. This is the single most important finding for this feature.

### ⚠ Marketplace filtering today is client-side JavaScript
`website-repository.ts:getAll()` reads **every active row** via `readAllPages`,
then `query-engine.ts:runQuery()` filters in the browser. There is no server-side
search anywhere (`websiteService.search()` only hits the mock store).
**The MCP must build real SQL filters. Reusing `getAll()` would load the whole
database per request — precisely what must not happen.**

### ⚠ "30% of traffic from the UK" is only partly answerable
`websites.audience_split` is jsonb `[{country, share, traffic}]` holding **at most
3 countries** (`AHREFS_TOP_COUNTRIES = 3`), `share` is derived not reported, and the
column is unindexed. A site whose UK traffic ranks 4th has no UK figure at all.
V1 will answer this as a *filter on known top-3 share* and say so in the tool
description and the response, rather than implying full country coverage.

### Public identifiers already exist — no migration needed
`websites.id` is `uuid default gen_random_uuid()` and `websites.slug` is a unique
text handle. Neither is sequential. Per the brief, no new identifier work.

### Reusable, already-built pieces
| Need | Existing thing |
|---|---|
| Customer price | `placementPrice()` — `src/lib/utils/pricing.ts` |
| Niche acceptance | `acceptsTopic()` — `src/lib/marketplace/topic.ts`; `accepted_niches text[]` is source of truth |
| Field allowlists | `WEBSITE_SELECT` vs `WEBSITE_SELECT_ADMIN` (`mappers.ts`), `withoutCost()`/`publicItems()` |
| Atomic rate limiting | `rate_limits` table + `consume_rate_limit()` RPC (`0009`) |
| Audience-bound tokens | `signToken`/`verifyToken`, `SessionAudience` — `src/lib/auth/session-token.ts` |
| Account tiers | `profiles.plan` already `'starter' \| 'growth' \| 'agency'` |
| Own-link history | `monitored_links` (`buyer_id`, `website_id`, `placed_url`) + `order_items.website_domain` |
| Full-text | `websites_search_idx` GIN on `to_tsvector(domain‖title‖description)` |

### ⚠ Protocol: build for 2025-11-25, not the newest spec
- Current spec revision is **2026-07-28** (POST-only, protocol-level sessions removed).
- **The official TypeScript SDK 1.32.1 only supports up to `2025-11-25`** (verified from the published tarball: `LATEST_PROTOCOL_VERSION = '2025-11-25'`).
- So V1 targets **2025-11-25 via `@modelcontextprotocol/sdk`, in stateless mode**
  (`sessionIdGenerator: undefined`) — which also happens to be exactly what a
  serverless function wants. Upgrade path documented when the SDK ships 2026-07-28.
- Spec obligations for us: RFC 9728 Protected Resource Metadata, OAuth 2.1 AS with
  RFC 8414 metadata, PKCE, RFC 8707 resource indicators, audience validation,
  `WWW-Authenticate` on 401. Client ID Metadata Documents are now preferred and
  **DCR is deprecated but still what shipping clients use** — support both.
- The SDK ships the OAuth AS handlers (`server/auth/*`: authorize, token, register,
  revoke, metadata, bearerAuth) so we implement a provider, not OAuth from scratch.
- `zod@^4.6.5` is already present; SDK expects `^3.25 || ^4.0` — compatible.

---

## Recommended shape

**Same repo, same Vercel project, isolated route tree, own hostname.**
`mcp.pressparrot.com` is added as a Vercel domain alias; MCP lives at `/api/mcp/*`
and `/.well-known/*`. Rationale: `/api/**` already bypasses all website middleware
and each route is its own function, so MCP load or faults never execute website
code — the isolation requirement is met today, with no second deployment to
maintain. All MCP code goes in `src/lib/mcp/**` and imports only from shared
services, never from page/component code, so it can be lifted into its own Vercel
project later without a rewrite. (A second Vercel project is the alternative; it
buys deploy isolation at the cost of restructuring shared code into a package.)

---

## Anti-harvesting design (the core of V1)

Five independent layers. Any one of them failing does not open the database.

**1. Hard caps, server-side, not client-overridable.**
`MAX_RESULTS = 25` enforced after schema parse (`z.number().max(25)` *and* a
`Math.min` clamp). Unknown parameters rejected by `.strict()` zod schemas.
No tool returns an unbounded set; there is no "all" parameter anywhere.

**2. Bounded reach per query — the main structural defence.**
Pagination depth is capped at **offset ≤ 75 (3 pages of 25)**. Past that the tool
returns a structured "refine your search" result instead of more rows. Combined
with (3), "keep requesting the next page" cannot walk the table — the walk has no
further pages to give.

**3. Unique-publisher exposure budget.**
New table `mcp_publisher_exposure (account_id, website_id, first_exposed_at,
last_exposed_at, exposure_count, last_tool)` PK `(account_id, website_id)`.
One `insert … on conflict do update … returning (xmax = 0) as is_new` per request
writes the whole result set in a single statement and reports which rows were
genuinely new. **Only new rows consume allowance; re-seeing a publisher is free**,
as required. Admission happens inside a SQL function so the check and the write
cannot race.

**4. Enumeration detection on multiple signals, not one rule.**
Recorded per request in `mcp_request_log`: tool, filter fingerprint, band
signature, offset, result count, new-unique count, duration. Signals scored
together: sustained ~100% new-result ratio; repeated deep offsets; adjacent
numeric bands walked (DR 0-10, 10-20, …) detected by hashing the filter shape
with band values removed; searches carrying no intent (no topic/target/keyword);
raw volume. **A few ordinary searches score nothing** — the score needs several
signals at once.

**5. Progressive response, MCP-only.**
`ok → soft-limited (slower, smaller pages) → search-restricted (recommend/compare
still work) → suspended (admin review)`, held in `mcp_account_state`. None of it
touches the customer's website session; a suspended MCP account browses
pressparrot.com normally.

**Meaningful-search requirement.** `search_publishers` requires at least one of:
topic, niche, country, keyword/query, DR/traffic/keyword range, price range,
link type, or target URL. A blank search returns a structured refusal.

**Honest limitation:** the server sees *parameters*, not the customer's prose. It
cannot detect "ask Claude to export everything" by reading intent — it detects the
*request shape* that attempt necessarily produces (no constraints, deep offsets,
band sweeps, high new-unique rate). The refusal wording also goes in the tool
descriptions so a well-behaved client declines early, but enforcement is
parameter-shaped and does not rely on the AI.

### Proposed V1 limits — these need your sign-off

Central config `src/lib/mcp/limits.ts`, keyed by `profiles.plan`, nothing
hardcoded elsewhere. Starting values, chosen against a marketplace heading for
~8,000 listings:

| Limit | starter | growth | agency |
|---|---|---|---|
| Results per request | 25 | 25 | 25 |
| Max pagination offset | 75 | 75 | 150 |
| Requests / minute | 20 | 20 | 30 |
| Requests / hour | 200 | 300 | 600 |
| **New unique publishers / hour** | 150 | 250 | 400 |
| **New unique publishers / day** | 400 | 700 | 1,200 |
| **New unique publishers / 30 days** | 2,000 | 3,500 | 6,000 |

At 2,000/30d a determined harvester needs ~4 months for an 8,000-row marketplace
and trips the enumeration detector long before. A real agency campaign (20–40
candidates per client) stays far under.

---

## MCP tools (V1, all read-only)

Every response is built by an explicit allowlist mapper — fields named one by one,
never a spread of a database row.

| Tool | Returns | Notes |
|---|---|---|
| `search_publishers` | ≤25 results | Requires ≥1 constraint. SQL-filtered. |
| `get_publisher` | one publisher, fuller detail | By slug or uuid. Counts as 1 exposure. |
| `recommend_publishers` | ≤25 scored candidates + `reasons[]` | Deterministic score, weights in config. No fake AI, no SEO guarantees. |
| `check_link_history` | which of *your* domains you've used | From `monitored_links` + `order_items`, scoped to `auth.uid()`. |
| `find_new_opportunities` | search minus own history | Composition of the two above. |
| `compare_publishers` | ≤10 side by side | Explicit id list only — no ranges. |
| `estimate_campaign` | costed shortlist, clearly an estimate | Uses `placementPrice()`. Writes nothing. |
| `get_account_link_history` | own placements, paginated | Own data only. |

Deliberately absent: anything resembling list-all/export/bulk. Future write tools
(`create_campaign`, `create_order`, …) are architected for but **not** implemented.

**Search result fields:** slug, domain, primary niche, DR, organic traffic,
referring domains, organic keywords, top-3 country shares, customer price,
turnaround, link types, relevance score + reasons.
**Never:** `service_costs`, `website_contacts`, `website_niche_costs`,
`website_commercials`, admin notes, supplier anything, `ahrefs_tier`,
`description_checked_at`, internal flags.

---

## Database changes (all additive, all reversible)

Migrations `0063`–`0065`, following the existing conventions (`.paste.sql` via
`scripts/flatten-migration.mjs`, rollback file + README row, re-runnable twice,
admin-only RLS with no customer-facing policy).

- `mcp_oauth_clients`, `mcp_oauth_authorizations`, `mcp_tokens` — OAuth AS state.
  Tokens stored **hashed**, never raw; `revoked_at`; expiry.
- `mcp_connections` — what the dashboard shows: client name, scopes, created, last used.
- `mcp_publisher_exposure` — the ledger above.
- `mcp_request_log` — one row per request, **no prompt text, no conversation**.
- `mcp_account_state` — progressive-protection level, admin overrides.
- SQL functions: `mcp_admit_exposure(...)` (atomic check-and-record),
  `mcp_consume_quota(...)` (fail-**closed**, unlike the existing auth wrapper which
  deliberately fails open).

**Indexes — only these two on existing tables, each justified:**
1. `websites_accepted_niches_gin` — GIN on `accepted_niches text[]`. Every MCP niche
   search filters on it and there is no index today, so it is a sequential scan.
2. `websites_active_dr_idx` — partial `(domain_rating desc, id) where status = 'active'`,
   matching the hot path and giving a stable tiebreak for keyset pagination.

Anything further gets `EXPLAIN`'d against production-scale data first and proposed
separately, rather than added speculatively.

---

## Files

**New:** `src/lib/mcp/{server,tools/*,limits,scoring,exposure,detect,allowlist,errors}.ts`,
`src/lib/mcp/oauth/*`, `src/app/api/mcp/route.ts`, `src/app/api/mcp/health/route.ts`,
`src/app/.well-known/oauth-protected-resource/route.ts` (+ AS metadata, authorize,
token, register, revoke), `src/app/dashboard/ai-connections/{page,actions}.tsx`,
`src/app/(marketing)/mcp/page.tsx`, `src/app/admin/(protected)/mcp/page.tsx`,
`docs/MCP.md`, `scripts/verify-mcp.mts`, `supabase/tests/22_mcp.sql`.

**Modified (small, additive):** `src/lib/config/navigation.ts` (one nav item),
`package.json` (dep + `verify:mcp`), `scripts/verify-rls.sh` (one test line),
`.env.example`, `supabase/rollbacks/README.md`, `AGENTS.md` (an MCP section).

**Not touched:** proxy matcher, marketplace pages/queries, checkout, SEO
(`robots.ts`, `sitemap.ts`, canonicals, metadata), any existing migration.

**Env:** `MCP_ENABLED` (kill switch, default off), `MCP_TOKEN_SECRET`,
`MCP_PUBLIC_URL`, `MCP_BETA_ACCOUNTS`. No secret committed.

---

## Verification

- `scripts/verify-mcp.mts` — pure, no DB/network: limit clamping, `.strict()` schema
  rejection of unknown params, allowlist mappers proving no internal field can
  escape, scoring determinism, band-sweep fingerprinting, offset cap.
- `supabase/tests/22_mcp.sql` — added to the explicit list in `verify-rls.sh`:
  exposure admission arithmetic, re-seeing costs nothing, quota fails closed,
  cross-account isolation, admin-only RLS on every new table, `anon` refused on
  every new function (the hole I found and fixed in 0062).
- **Extraction attempts as tests**, per the brief: `limit=100000`, blank search,
  sequential paging past the cap, cursor fiddling, band sweeps, id guessing,
  SQL-ish injection in every string field, unknown parameters, hidden-field
  requests, cross-account reads, multi-tool budget bypass.
- Existing suites (`verify:rls`, `:marketplace`, `:pricing`, `:access`, `:paging`)
  must stay green — they pin the behaviour this must not change.
- **Final gate:** written answer to "could a determined authenticated customer
  reconstruct a substantial portion of the database?", with the arithmetic.

---

## Delivery

Sequenced PRs, each independently revertible, each with its own migration to run:

1. Migrations + limits config + exposure/quota functions + SQL tests
2. OAuth AS + token storage + `/.well-known` discovery
3. MCP endpoint + `search_publishers`/`get_publisher` + anti-harvesting enforcement
4. Remaining six tools + scoring
5. Dashboard AI Connections + `/mcp` landing page
6. Admin MCP panel + `docs/MCP.md` + DNS instructions

DNS: I will tell you exactly what to add for `mcp.pressparrot.com`; I will not
touch DNS.

## Open question carried into build

Whether `search_publishers` should expose a country-share filter at all given the
top-3 limitation, or only surface the shares as output. I lean toward exposing it
with an explicit "known top-3 markets only" caveat in the tool description.
