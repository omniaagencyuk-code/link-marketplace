-- ---------------------------------------------------------------------------
-- The inventory is not a download
--
-- 0006 put the marketplace behind an account, and that is still true of every
-- page: `proxy.ts` refuses an inventory path without a session, and each page
-- asks again with `requireCustomerSession`. What it did not do was make the
-- inventory any harder to *take* once somebody had an account.
--
-- The policy it wrote is `to authenticated using (status = 'active')`. The
-- publishable key ships in the browser - it has to, it is what the session is
-- carried with - so that policy is also an instruction to PostgREST, which
-- will happily serve
--
--     GET /rest/v1/websites?select=*&limit=1000&offset=0
--
-- to anybody holding a free account. Twelve thousand listings is thirteen
-- requests. No page is rendered, no rate limit is passed, nothing is logged
-- beyond the request itself, and every price and metric comes out with the
-- domains.
--
-- That is the hole this closes, and it closes it by removing the grant rather
-- than by making it cleverer. Row level security answers "may this row be
-- read", one row at a time; it has nothing to say about "how much of the
-- table may one account have today", so no policy can express the rule that
-- matters here.
--
-- ## What replaces it
--
-- Nothing, for the browser. After this migration the three inventory tables
-- have no policy that matches `authenticated` at all, so a request carrying a
-- customer's token gets an empty array from all three.
--
-- The application reads them on the service role instead, from server code a
-- browser cannot reach, and every customer-facing read states `status =
-- 'active'` itself - which is the one thing the dropped policy was doing
-- besides gatekeeping, and the reason `verify:rls` grew an assertion per read.
--
-- The budget below is what stands in for "how much of the table": it is spent
-- in rows rather than requests, because rows are what a scraper needs and a
-- request is whatever page size they ask for.
--
-- ## What this is not
--
-- It is not a defence against somebody paying for an account and reading the
-- marketplace at human speed for a month. Nothing is. It raises the cost of
-- taking the whole thing from thirteen requests to something that looks like
-- use, which is the only honest goal: every published listing is, in the end,
-- a page we are asking people to read.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Close the door
--
-- `drop policy if exists` rather than a conditional: this has to be safe to
-- run twice, because these are pasted into the SQL editor by hand.
-- ---------------------------------------------------------------------------
drop policy if exists "Signed-in users read active websites" on public.websites;
drop policy if exists "Signed-in users read website categories" on public.website_categories;
drop policy if exists "Signed-in users read services" on public.services;

-- The admin policies, where they exist, are untouched: the admin area runs on
-- the service role, which bypasses row level security entirely, and `is_admin()`
-- is false for it anyway because the admin signs in with a shared password
-- rather than through Supabase Auth.

-- ---------------------------------------------------------------------------
-- 2. A budget, spent in rows
--
-- The same table `consume_rate_limit` uses, because a second counter with the
-- same shape would be a second thing to prune, to assert and to reason about.
-- What differs is the unit: that one records an attempt, this one records how
-- many listings an account was served, so a single request for a hundred rows
-- costs a hundred.
--
-- Returns 0 when the read may go ahead, or the seconds until the window
-- resets when it may not. The caller decides what to say; `mayReadInventory`
-- says "try again shortly" and never quotes this figure, for the reason
-- `mayRunGap` does not quote ours: a refusal that names our limit is a
-- refusal that teaches somebody how to stay just under it.
--
-- Spending happens before the rows are read rather than after. A read that
-- fails still cost us the intent, and a budget that only charges for success
-- is one that can be walked by asking for pages that error.
-- ---------------------------------------------------------------------------
create or replace function public.spend_inventory_budget(
  p_bucket text,
  p_rows integer,
  p_max integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_cost integer := greatest(0, coalesce(p_rows, 0));
  v_count integer;
  v_expires timestamptz;
begin
  insert into public.rate_limits (bucket, count, expires_at)
  values (p_bucket, v_cost, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set
      -- An expired window starts again at this read's cost rather than
      -- continuing to climb, exactly as the attempt counter does.
      count = case
        when public.rate_limits.expires_at <= v_now then v_cost
        else public.rate_limits.count + v_cost
      end,
      expires_at = case
        when public.rate_limits.expires_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.rate_limits.expires_at
      end
  returning count, expires_at into v_count, v_expires;

  if v_count > p_max then
    return greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer);
  end if;

  return 0;
end;
$$;

comment on function public.spend_inventory_budget(text, integer, integer, integer) is
  'Spend a number of inventory rows against an account''s hourly budget. Returns 0 when the read may proceed, or the seconds until the window resets. Shares the rate_limits table with consume_rate_limit; the unit is rows rather than attempts.';

/*
  Service role only.

  Every other grant on this is a way to find the limit by probing it, and
  there is nothing a customer's own token needs it for: the reads it guards
  are made by our server, not by their browser.
*/
/*
  `from public` first, and it is not a formality.

  Postgres grants execute on a new function to PUBLIC, so revoking from
  `anon, authenticated` alone leaves both of them holding it through the
  grant everybody has. The first version of this migration did exactly that
  and `verify:rls` printed "a customer cannot call marketplace_search: f".

  Which is also why the grant to `service_role` has to be written down: once
  PUBLIC loses it, the role the application connects as has nothing left to
  inherit it from.
*/
revoke all on function public.spend_inventory_budget(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.spend_inventory_budget(text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The four functions that were reading on the customer's behalf
--
-- These are `security invoker`: they ran as whoever called them, so they were
-- reading `websites` and `services` through the policy dropped above and
-- would answer nothing at all from here on. `verify:rls` found three of them
-- within a minute, which is the whole reason that suite exists; the fourth
-- was found by asking the catalogue which functions read those tables rather
-- than by waiting for a test to notice.
--
-- `alter function` rather than re-creating them: the search function alone is
-- a hundred and sixty lines, and a copy of it in this file would be a second
-- definition to keep in step with the first. Changing the flag changes
-- nothing about what they return.
--
-- Definer here does not make them public. Two of the four have their
-- execute grant revoked below, so only the service role may call them, and
-- the application reads them from server code. What definer buys is that the
-- function may read a table its caller cannot - which is the arrangement
-- `marketplace_stats` has had since 0006.
-- ---------------------------------------------------------------------------
alter function public.marketplace_search(
  text, text[], text[], text, integer, integer, text[], text[], text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  boolean, text, text, integer, integer
) security definer;

alter function public.marketplace_placements(uuid, text, text[], integer, integer) security definer;
alter function public.customer_recommendations(integer) security definer;

/*
  `marketplace_niche_preview` is deliberately not in that list.

  Its own test says why: the public niche pages render it for a signed-out
  visitor, and `security invoker` is what keeps that honest - the policy
  decides what it returns, as it does for every other public read. Made
  definer it would start answering a stranger with listing ids, which is a
  change nobody asked for in a migration about taking access away.

  It keeps its execute grant too, so it is callable and empty for anon
  exactly as it was. The application reads it on the service role, which is
  where the ids were always turned into redacted rows.
*/

/*
  Two of the four, closed to a customer's token.

  Ids and counts are not domains, so none of these would hand over the
  inventory on its own - but each is a way to ask the shape of it a hundred
  rows at a time, and none of them is called from a browser. The application
  calls them on the service role.
*/
revoke all on function public.marketplace_search(
  text, text[], text[], text, integer, integer, text[], text[], text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  boolean, text, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.marketplace_search(
  text, text[], text[], text, integer, integer, text[], text[], text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  boolean, text, text, integer, integer
) to service_role;

revoke all on function public.marketplace_placements(uuid, text, text[], integer, integer) from public, anon, authenticated;
grant execute on function public.marketplace_placements(uuid, text, text[], integer, integer) to service_role;

/*
  The fourth keeps its grant, and has to.

  `customer_recommendations` personalises by `auth.uid()` - what this customer
  has already ordered - and on the service role there is no uid, so every
  customer would be told their suggestions are not personalised. It is the one
  function here that must run with the caller's identity.

  What that costs is bounded by the function rather than by trust: it returns
  at most twelve ids, no domain, no price, from active listings the customer
  has not already bought. Twelve ids an account already holds a session for is
  not a route into the inventory.
*/
grant execute on function public.customer_recommendations(integer) to authenticated;
