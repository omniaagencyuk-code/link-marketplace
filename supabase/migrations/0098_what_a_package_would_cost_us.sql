-- ---------------------------------------------------------------------------
-- What a package would cost us
-- ---------------------------------------------------------------------------
--
-- A managed package promises a count, a minimum domain rating, a minimum
-- traffic and a niche, and then we choose the publishers. Two questions have
-- to be answerable before one can be sold at a fixed fee:
--
--   can we fill it in this niche, and what will the links cost us?
--
-- Neither is answerable today. The admin can see one listing's cost at a
-- time, which tells nobody whether there are ten DR40 finance sites or two,
-- nor what ten of them come to.
--
-- Purely additive: this creates a function and changes nothing that exists,
-- so it is safe to run before or after the deploy that calls it. 0097 was
-- not, and dropping something the running code still called took the niche
-- pages down. The shape to copy is this one.
--
-- ## Why costs are not simply averaged
--
-- `service_costs.cost_price_minor` carries no currency. The currency is on
-- the listing, in `website_commercials.cost_currency`, and 0019 is explicit
-- that it is the publisher's own and is never converted: "converting on the
-- way in would lose the number they actually agreed to".
--
-- So a median across listings quoted in different currencies is a number
-- nobody ever quoted. Rather than convert here - which would put a second
-- copy of the conversion and its buffer in SQL, where the pricing engine
-- already owns them - this refuses: where a niche and tier hold costs in
-- more than one currency, the currency and every percentile come back null,
-- and `with_cost` still says how many listings were there. A gap that says
-- it is a gap beats a number nobody can act on.
--
-- ## Percentiles rather than an average
--
-- One publisher charging a fortune drags a mean somewhere no real placement
-- sits. The quartiles say what the middle half actually costs, which is what
-- a fee has to clear.

create or replace function public.package_inventory_depth(
  p_traffic_min integer default 1000
)
returns table (
  niche text,
  dr_min integer,
  /** Listings we could sell at this niche and rating. */
  listings bigint,
  /** How many of those have a cost recorded, in a currency we can read. */
  with_cost bigint,
  /** Null where the costs span more than one currency - see above. */
  cost_currency text,
  cost_low_minor integer,
  cost_median_minor integer,
  cost_high_minor integer,
  /** What we charge today, for comparison. Always in our own currency. */
  sell_median_minor integer
)
language sql
stable
security definer
set search_path = public
as $$
  with tiers(dr_min) as (
    select unnest(array[10, 20, 30, 40, 50, 60])
  ),
  /*
    Every active listing, once per niche it belongs to - the same lateral
    union `niche_page_counts` uses, so "in a niche" means here exactly what
    it means on the niche pages.
  */
  expanded as (
    select
      m.id,
      m.domain_rating,
      n.slug as niche,
      (
        select min(s.price_minor)
        from public.services s
        where s.website_id = m.id and s.available and s.price_minor > 0
      ) as sell_minor,
      /*
        The cheapest available service that has a cost recorded. `available`
        on both sides: a paused service is not what a package would buy, so
        its cost is not what a package would pay.
      */
      (
        select min(sc.cost_price_minor)
        from public.services s
        join public.service_costs sc on sc.service_id = s.id
        where s.website_id = m.id and s.available
      ) as cost_minor,
      wc.cost_currency
    from public.marketplace_listings m
    cross join lateral (
      select m.niche as slug where m.niche is not null
      union
      select unnest(m.secondary_niches) as slug
    ) n
    left join public.website_commercials wc on wc.website_id = m.id
    where m.status = 'active'
      and m.organic_traffic >= p_traffic_min
  ),
  grouped as (
    select
      e.niche,
      t.dr_min,
      count(*) as listings,
      count(*) filter (
        where e.cost_minor is not null and e.cost_currency is not null
      ) as with_cost,
      count(distinct e.cost_currency) filter (
        where e.cost_minor is not null and e.cost_currency is not null
      ) as currencies,
      max(e.cost_currency) filter (
        where e.cost_minor is not null and e.cost_currency is not null
      ) as a_currency,
      percentile_cont(0.25) within group (order by e.cost_minor) as cost_low,
      percentile_cont(0.5) within group (order by e.cost_minor) as cost_median,
      percentile_cont(0.75) within group (order by e.cost_minor) as cost_high,
      percentile_cont(0.5) within group (order by e.sell_minor) as sell_median
    from tiers t
    join expanded e on e.domain_rating >= t.dr_min
    -- Nothing buyable is nothing a package could be filled with.
    where e.sell_minor is not null
    group by e.niche, t.dr_min
  )
  select
    g.niche,
    g.dr_min,
    g.listings,
    g.with_cost,
    case when g.currencies = 1 then g.a_currency end,
    case when g.currencies = 1 then round(g.cost_low)::integer end,
    case when g.currencies = 1 then round(g.cost_median)::integer end,
    case when g.currencies = 1 then round(g.cost_high)::integer end,
    round(g.sell_median)::integer
  from grouped g
  order by g.niche, g.dr_min;
$$;

comment on function public.package_inventory_depth(integer) is
  'Per niche and domain rating tier: how many listings a managed package could be filled from, and what the middle half of them cost us. Costs come back null where the niche holds more than one publisher currency, because a median across currencies is a figure nobody quoted.';

/*
  The lock-down 0090 applied to every function that reads the inventory.
  This one also reads what we pay, so it matters more than most: Postgres
  grants EXECUTE to PUBLIC by default, and revoking from anon and
  authenticated alone would leave that door open.
*/
revoke all on function public.package_inventory_depth(integer) from public, anon, authenticated;
grant execute on function public.package_inventory_depth(integer) to service_role;
