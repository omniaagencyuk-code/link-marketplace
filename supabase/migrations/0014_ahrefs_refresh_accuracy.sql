-- ---------------------------------------------------------------------------
-- Ahrefs refresh: measured cost, live counts, and audience by country
--
-- 0013 shipped the refresh with three assumptions baked in, and all three were
-- wrong in ways that matter to the budget:
--
--   1. Cost was computed as `units_per_domain` x targets. Ahrefs prices a call
--      by the columns it is asked for, so the moment the job selects another
--      field that number is fiction. Ahrefs reports the actual cost with every
--      response; that is what is now recorded, and `units_per_domain` is
--      demoted to a forecasting estimate used only before a call is made.
--   2. Tier sizes assumed a 37,700-domain inventory split 10k/10k/rest. The
--      inventory is what it is on the day, so the sizes are smaller and every
--      projection below counts live rows instead.
--   3. Spend was tracked only from this job's own run history. The Ahrefs
--      allowance is shared with everything else on the account, so each run
--      now reads the live figure from Ahrefs and prefers it when the two
--      disagree.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------- refresh settings --
alter table public.refresh_settings
  -- The admin page warns when the projected monthly spend crosses this share
  -- of the budget - early enough to change the cadence before a run is
  -- refused by the guard.
  add column if not exists projection_warn_pct smallint not null default 85
    check (projection_warn_pct between 1 and 100);

-- Sized for an inventory where the top few thousand domains are worth weekly
-- attention and the long tail is not.
alter table public.refresh_settings
  alter column tier1_size set default 3000,
  alter column tier2_size set default 6000;

-- Only moves a row still sitting on 0013's defaults. A tuned value is a
-- decision someone made and is left alone.
update public.refresh_settings
   set tier1_size = 3000, tier2_size = 6000
 where id and tier1_size = 10000 and tier2_size = 10000;

comment on column public.refresh_settings.units_per_domain is
  'Estimate only. Used to forecast spend before a call is made; the actual '
  'cost is read back from Ahrefs and recorded on the run.';
comment on column public.refresh_settings.monthly_unit_budget is
  'Fallback. When Ahrefs reports a workspace limit, the live figure wins.';

-- ------------------------------------------------------------ run history --
alter table public.refresh_runs
  -- What the run expected to spend, kept beside what it did spend so the
  -- estimate can be corrected rather than trusted.
  add column if not exists units_estimated integer,
  -- The live figures from Ahrefs at the start of the run. Null means Ahrefs
  -- was not reachable or no token was configured - not that usage was zero.
  add column if not exists ahrefs_units_used integer,
  add column if not exists ahrefs_units_limit integer,
  add column if not exists ahrefs_usage_reset_at timestamptz;

comment on column public.refresh_runs.units_spent is
  'Actual cost reported by Ahrefs where available, falling back to the '
  'estimate when a response carried no cost.';
comment on column public.refresh_runs.ahrefs_units_used is
  'Workspace-wide usage as Ahrefs reported it, covering every consumer of the '
  'allowance rather than this job alone.';

-- ---------------------------------------------------------------------------
-- What a domain actually costs
--
-- Averaged over recent live runs rather than configured, so the forecast
-- follows the columns the job is really asking for. Null until a live run has
-- happened, which is the honest answer before there is any evidence.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_units_per_domain_actual()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when sum(domains_refreshed + domains_failed) > 0
      then sum(units_spent)::numeric / sum(domains_refreshed + domains_failed)
  end
  from public.refresh_runs
  where status = 'completed'
    and not dry_run
    and units_spent > 0
    -- A run that spent units without touching a domain says nothing about
    -- what a domain costs, and averaging its spend over the others would
    -- inflate every forecast that followed.
    and domains_refreshed + domains_failed > 0
    and started_at >= timezone('utc', now()) - interval '90 days';
$$;

-- ---------------------------------------------------------------------------
-- The live usage figure
--
-- The most recent run that managed to read Ahrefs. Shown on the admin page so
-- the budget bar can be reconciled against the account rather than against
-- this job's own arithmetic.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_latest_usage()
returns table (
  units_used integer,
  units_limit integer,
  usage_reset_at timestamptz,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ahrefs_units_used, ahrefs_units_limit, ahrefs_usage_reset_at, started_at
  from public.refresh_runs
  where ahrefs_units_used is not null
  order by started_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Projected monthly spend
--
-- Live row counts per tier, each tier's configured cadence, and the measured
-- cost per domain. Thirty days is used as the month: the cadences are in days
-- and a calendar month would make the figure move for reasons that have
-- nothing to do with the settings.
--
-- This is what the admin page warns on, and it is deliberately independent of
-- the run history: a cadence that cannot be afforded should be visible before
-- a single run proves it.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_projected_monthly_units()
returns integer
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
  tiers as (
    select coalesce(w.ahrefs_tier, 3) as tier, count(*)::numeric as total
    from public.websites w
    where w.status <> 'archived'
    group by 1
  )
  select coalesce(ceil(sum(
    t.total
    * (30.0 / case t.tier
        when 1 then s.tier1_interval_days
        when 2 then s.tier2_interval_days
        else s.tier3_interval_days
      end)
    * p.units
  )), 0)::integer
  from tiers t
  cross join s
  cross join per_domain p;
$$;

revoke all on function public.ahrefs_units_per_domain_actual() from public;
revoke all on function public.ahrefs_latest_usage() from public;
revoke all on function public.ahrefs_projected_monthly_units() from public;
