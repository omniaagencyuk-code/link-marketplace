-- ---------------------------------------------------------------------------
-- 0052  What assigning tiers would cost, before it is assigned
--
-- `assign_ahrefs_tiers()` reassigns the whole inventory and the cost lands
-- every month afterwards. There was no way to ask what it would do first.
--
-- The sizes it reads ship at 3,000 and 6,000, sized in 0014 for an inventory
-- where the long tail is not worth weekly attention. The inventory is 3,472
-- listings, so every one of them ranks inside those two bands: pressing the
-- button puts 3,000 domains on the weekly cadence and the remaining 472 on
-- the fortnightly one. Nothing is left on monthly at all.
--
-- Measured against a simulated inventory of that size at the 90 units a
-- domain the job really costs:
--
--   today, everything monthly          312,480 units a month
--   after the button, 3,000/6,000    1,248,172 units a month
--
-- Four times the spend, 62% of the allowance, permanently, from one button
-- with no confirmation and no way to see the number first. And it passes both
-- existing guards: it is under the 1,800,000 a run stops at, and under the
-- 85% the settings warn at. Only the change gives it away.
--
-- This computes the same assignment without writing it, and the same monthly
-- projection the admin page already shows, so the button can say what it is
-- about to do and refuse a cadence the budget cannot sustain.
--
-- It mirrors `assign_ahrefs_tiers` exactly, including the part that is easy to
-- miss: locked listings are left out of the ranking and keep the tier they
-- have. A preview that re-tiered them would disagree with the assignment it
-- is previewing. `07_ahrefs_refresh.sql` checks the two against each other at
-- five sizes rather than trusting that they still agree.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.ahrefs_tier_preview(
  p_tier1_size integer,
  p_tier2_size integer
)
returns table (tier1 bigint, tier2 bigint, tier3 bigint, projected_units bigint)
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from public.refresh_settings where id),
  per_domain as (
    select coalesce(
      public.ahrefs_units_per_domain_actual(),
      (select units_per_domain from s)::numeric
    ) as units
  ),
  -- Only the listings the assignment would actually move, ranked the way it
  -- ranks them.
  ranked as (
    select
      id,
      row_number() over (
        order by domain_rating desc nulls last, organic_traffic desc nulls last, id
      ) as position
    from public.websites
    where status <> 'archived'
      and not ahrefs_tier_locked
  ),
  would_be as (
    select case
      when r.position <= greatest(0, p_tier1_size) then 1
      when r.position <= greatest(0, p_tier1_size) + greatest(0, p_tier2_size) then 2
      else 3
    end as tier
    from ranked r

    union all

    -- A locked listing keeps whatever it has, and an unset tier reads as 3 -
    -- the same cautious reading the overdue counts use.
    select coalesce(w.ahrefs_tier, 3)::integer
    from public.websites w
    where w.status <> 'archived'
      and w.ahrefs_tier_locked
  ),
  counts as (select tier, count(*)::numeric as n from would_be group by tier)
  select
    coalesce((select n from counts where tier = 1), 0)::bigint,
    coalesce((select n from counts where tier = 2), 0)::bigint,
    coalesce((select n from counts where tier = 3), 0)::bigint,
    coalesce(ceil(sum(
      c.n
      * (30.0 / case c.tier
          when 1 then s.tier1_interval_days
          when 2 then s.tier2_interval_days
          else s.tier3_interval_days
        end)
      * p.units
    )), 0)::bigint
  from counts c
  cross join s
  cross join per_domain p;
$$;

revoke all on function public.ahrefs_tier_preview(integer, integer) from public;
revoke all on function public.ahrefs_tier_preview(integer, integer) from anon;
revoke all on function public.ahrefs_tier_preview(integer, integer) from authenticated;
