-- ---------------------------------------------------------------------------
-- A tier needs a typical price, not only its cheapest
-- ---------------------------------------------------------------------------
--
-- The price table went live reading "$8 / placement" on all six tiers, then -
-- once a readers floor was added - "$15" on four of them. Both times for the
-- same reason: the figure shown is the cheapest listing that qualifies, and
-- one cheap listing qualifies for DR10+ and DR40+ alike. Six rows carrying
-- the same number are six rows telling a buyer nothing, which is the whole
-- job of the page.
--
-- The minimum is not wrong, it is just not informative on its own. So the
-- table gains a second figure: what a placement at this rating typically
-- costs. "From" stays, because it is true and because it is the row the
-- See sites button lands on.
--
-- ## Why this cannot be done with the read it replaces
--
-- The page asks for one row per tier, sorted by price, and reads the price
-- off it. A median needs every qualifying row, and there are thousands - the
-- shape that put a statement timeout on /guest-posts. So it is counted in
-- Postgres and the page is handed four numbers.
--
-- ## And why it does not re-derive what a listing costs
--
-- `marketplace_placements` already works that out - the available services
-- where there are any, otherwise all of them, cheapest by placement
-- priority - and `marketplace_search` sorts by the figure it returns. This
-- calls the same function, so the median, the minimum and the order of the
-- page somebody lands on all come from one rule. Writing the priority
-- ordering out again here would be a second copy of it, and the copy that
-- drifted would be the one quoting a price.
--
-- `price_in_window` with a floor of one minor unit is how "buyable" is
-- spelled: it counts only available services, so it drops the unpriced
-- listing and the one whose every service is paused. The same argument
-- `tierQuery` passes, so the count here and the count on the page agree.
--
-- Purely additive: creates a function, changes nothing. Safe either side of
-- the deploy that calls it.

create or replace function public.tier_price_bands(
  p_traffic_min integer default 1000
)
returns table (
  dr_min integer,
  listings bigint,
  /** The cheapest qualifying listing - what "from" means. */
  from_minor integer,
  /** The middle of them, which is what a buyer should plan around. */
  median_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tiers(dr_min) as (
    select unnest(array[10, 20, 30, 40, 50, 60])
  ),
  sellable as (
    select m.domain_rating, pl.headline_price
    from public.marketplace_listings m
    cross join lateral public.marketplace_placements(m.id, null, null, 1, null) pl
    where m.status = 'active'
      and m.organic_traffic >= p_traffic_min
      -- Something somebody could actually buy, at a price.
      and pl.price_in_window
      and pl.headline_price is not null
  )
  select
    t.dr_min,
    count(*),
    min(s.headline_price)::integer,
    percentile_cont(0.5) within group (order by s.headline_price)::integer
  from tiers t
  join sellable s on s.domain_rating >= t.dr_min
  group by t.dr_min
  order by t.dr_min;
$$;

comment on function public.tier_price_bands(integer) is
  'Per domain rating tier: how many listings are sellable, the cheapest, and the median. Prices come from marketplace_placements, the same rule marketplace_search sorts by, so the figures and the page they link to cannot disagree.';

/*
  The lock-down 0090 applied to the functions that read the inventory.
  Postgres grants EXECUTE to PUBLIC by default, so revoking from anon and
  authenticated alone would leave that door open.
*/
revoke all on function public.tier_price_bands(integer) from public, anon, authenticated;
grant execute on function public.tier_price_bands(integer) to service_role;
