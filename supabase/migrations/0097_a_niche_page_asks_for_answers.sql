-- ---------------------------------------------------------------------------
-- A niche page asks for answers, not for its niche
-- ---------------------------------------------------------------------------
--
-- 0095 and 0096 got /guest-posts/<niche> from thirty-five round trips down to
-- one question, and left it shipping the answer the long way round: four
-- thousand listings and their services, across the Atlantic, to work out five
-- numbers and ten sample rows.
--
-- That is still a read whose size follows the inventory, which is the shape
-- every timeout on this page has had. It is also one missing `.range()` from
-- PostgREST's thousand-row cap, which is exactly how 0095 shipped - the cap
-- does not care that a function produced the rows.
--
-- So the page asks for what it displays. `niche_page_listings` goes.
--
-- ## The two rules this moves into SQL
--
-- Both were TypeScript, and a port like this fails quietly - a page shows
-- slightly different numbers and nothing says so. `verify:niche-pages` runs
-- both sides over the same fixtures and compares, the way `verify:search`
-- does for the marketplace filters, and for the same reason.
--
-- **The lowest price.** `pricedServices` takes the available services where
-- any are available and every service where none are, and `lowestPriceMinor`
-- is the minimum over that pool. `coalesce(min(...) filter (where available),
-- min(...))` is the same thing: the ordering `pricedServices` also applies is
-- what picks the HEADLINE price, and no caller here wants that one.
--
-- **The spread.** `spread(items, count)` takes the whole list when it is
-- short enough, and otherwise walks it at a stride of `(len-1)/(count-1)`,
-- rounding. Not the modulo stride `marketplace_niche_preview` uses - that is
-- a different selection, and copying it would quietly change which ten
-- publishers the page shows.
--
-- `p_count` and `p_min_traffic` are parameters rather than constants here
-- because `SAMPLE_COUNT` and `MIN_TRAFFIC_FOR_A_SAMPLE` already exist in
-- `niche-landing.ts` and a second copy would be a second thing to change.

drop function if exists public.niche_page_listings(text);

-- ---------------------------------------------------------------------------
-- The figures in the band at the top of the page.
-- ---------------------------------------------------------------------------
create or replace function public.niche_page_stats(p_niche text)
returns table (
  listings bigint,
  dr_min integer,
  dr_max integer,
  countries bigint,
  starting_price_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select
      m.id,
      m.domain_rating,
      m.country,
      (
        select coalesce(
          min(s.price_minor) filter (where s.available),
          min(s.price_minor)
        )
        from public.services s
        where s.website_id = m.id
      ) as lowest_price_minor
    from public.marketplace_listings m
    where m.status = 'active'
      and (m.niche = p_niche or p_niche = any(m.secondary_niches))
  )
  select
    count(*),
    /*
      Zero when nothing has a rating, matching `toStats`, which filters to
      ratings above zero and then reports 0 for an empty list rather than
      Infinity - which is what `Math.min()` of nothing returns.
    */
    coalesce(min(domain_rating) filter (where domain_rating > 0), 0)::integer,
    coalesce(max(domain_rating) filter (where domain_rating > 0), 0)::integer,
    count(distinct country) filter (where country is not null),
    -- Null rather than zero where nothing is priced: the page prints no
    -- starting price at all, and "from £0" is not a price.
    (min(lowest_price_minor) filter (where lowest_price_minor > 0))::integer
  from matched;
$$;

comment on function public.niche_page_stats(text) is
  'The band at the top of /guest-posts/<niche>: how many listings, the domain rating range, how many countries, and the lowest price. Replaces shipping every listing in the niche to count them.';

-- ---------------------------------------------------------------------------
-- The sample table under it.
-- ---------------------------------------------------------------------------
create or replace function public.niche_page_samples(
  p_niche text,
  p_count integer,
  p_min_traffic integer
)
returns table (
  domain_rating integer,
  organic_traffic integer,
  country text,
  lowest_price_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select
      m.domain_rating,
      m.organic_traffic,
      m.country,
      (
        select coalesce(
          min(s.price_minor) filter (where s.available),
          min(s.price_minor)
        )
        from public.services s
        where s.website_id = m.id
      ) as lowest_price_minor,
      m.id
    from public.marketplace_listings m
    where m.status = 'active'
      and (m.niche = p_niche or p_niche = any(m.secondary_niches))
  ),
  /*
    What `toSampleRows` keeps: loud enough to be worth showing, and priced.
    A strong domain rating with no readers is the thing buyers in this
    industry are most often sold, so it is not what goes in the window.
  */
  worth_showing as (
    select *
    from eligible
    where organic_traffic >= p_min_traffic
      and lowest_price_minor > 0
  ),
  ordered as (
    select
      w.*,
      row_number() over (order by w.domain_rating desc, w.id asc) - 1 as pos,
      count(*) over () as total
    from worth_showing w
  )
  select o.domain_rating, o.organic_traffic, o.country, o.lowest_price_minor
  from ordered o
  where
    /*
      `spread`, exactly. The whole list when it is short enough; otherwise
      the positions `round(i * (total - 1) / (count - 1))` for i in
      0 .. count-1.

      Postgres rounds a positive .5 away from zero and so does
      `Math.round`, so the two agree on every tie; `verify:niche-pages`
      walks fixture sizes either side of the boundary rather than taking
      that on trust.

      `p_count <= 1` would divide by zero here. `spread` divides by zero
      too and returns `[undefined]`, which is not a behaviour worth
      reproducing, so one row is returned instead. Nothing calls it that
      way - `SAMPLE_COUNT` is ten.
    */
    o.total <= greatest(p_count, 1)
    or p_count <= 1 and o.pos = 0
    or o.pos in (
      select round(i * (o.total - 1)::numeric / (p_count - 1))::bigint
      from generate_series(0, p_count - 1) as i
    )
  order by o.pos;
$$;

comment on function public.niche_page_samples(text, integer, integer) is
  'A spread of a niche''s listings for the sample table on /guest-posts/<niche>, walking the same strides as spread() in niche-landing.ts. Takes the count and the traffic floor as parameters so those constants keep one copy, in TypeScript.';

/*
  The same lock-down 0090 applied to the functions that read the inventory.
  Postgres grants EXECUTE to PUBLIC by default, so revoking from anon and
  authenticated alone leaves the door open.
*/
revoke all on function public.niche_page_stats(text) from public, anon, authenticated;
grant execute on function public.niche_page_stats(text) to service_role;

revoke all on function public.niche_page_samples(text, integer, integer) from public, anon, authenticated;
grant execute on function public.niche_page_samples(text, integer, integer) to service_role;
