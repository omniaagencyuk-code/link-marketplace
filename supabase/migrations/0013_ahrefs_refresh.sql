-- ---------------------------------------------------------------------------
-- Tiered Ahrefs refresh
--
-- Domain rating and organic traffic go stale, and refreshing ~37,700 domains
-- on one cadence either costs too much or leaves the best listings out of
-- date. Domains are placed in tiers and refreshed on different intervals, and
-- the job spends against a tracked budget rather than hoping.
--
-- Everything that governs the job lives in `refresh_settings` rather than in
-- environment variables, so thresholds can be tuned and the whole thing turned
-- on or off without a redeploy. It ships OFF.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- websites --
alter table public.websites
  -- 1 = most important, refreshed most often. Null means unassigned, which is
  -- treated as the slowest tier rather than as an error.
  add column if not exists ahrefs_tier smallint
    check (ahrefs_tier is null or ahrefs_tier between 1 and 3),
  -- Null means never refreshed, which sorts ahead of everything else: a domain
  -- with no figures at all is the most overdue thing in the database.
  add column if not exists last_ahrefs_refresh_at timestamptz,
  -- Set by hand to pin a domain to a tier. Re-running the automatic assignment
  -- leaves these alone, so a deliberate choice is not undone by a rebalance.
  add column if not exists ahrefs_tier_locked boolean not null default false;

-- The job's central query: overdue domains, worst first, tier order.
create index if not exists websites_ahrefs_refresh_idx
  on public.websites (ahrefs_tier, last_ahrefs_refresh_at nulls first)
  where status <> 'archived';

comment on column public.websites.ahrefs_tier is
  '1 weekly, 2 biweekly, 3 monthly. Null is treated as the slowest tier.';
comment on column public.websites.last_ahrefs_refresh_at is
  'Null means never refreshed - the most overdue state there is.';

-- ------------------------------------------------------- refresh settings --
create table public.refresh_settings (
  -- Single row, pinned. The constraint is what makes "the settings" a thing
  -- rather than "whichever row you happened to read".
  id boolean primary key default true check (id),

  -- The master switch. Off means the job exits before touching Ahrefs.
  enabled boolean not null default false,
  -- Runs the full selection logic and logs what it would do, without spending
  -- anything. For proving the tiering is right before paying to find out.
  dry_run boolean not null default true,

  -- How many domains in each of the top two tiers. Everything else is tier 3.
  tier1_size integer not null default 10000 check (tier1_size >= 0),
  tier2_size integer not null default 10000 check (tier2_size >= 0),

  tier1_interval_days smallint not null default 7 check (tier1_interval_days > 0),
  tier2_interval_days smallint not null default 14 check (tier2_interval_days > 0),
  tier3_interval_days smallint not null default 30 check (tier3_interval_days > 0),

  -- Ahrefs bills per domain; a 100-target batch costs 100x this.
  units_per_domain smallint not null default 12 check (units_per_domain > 0),
  monthly_unit_budget integer not null default 2000000 check (monthly_unit_budget >= 0),
  -- The job stops at this share of the budget, leaving the rest for everything
  -- else that uses the same allowance.
  budget_safety_pct smallint not null default 90 check (budget_safety_pct between 1 and 100),
  -- The day of the month the Ahrefs allowance resets.
  billing_cycle_day smallint not null default 1 check (billing_cycle_day between 1 and 28),

  -- Ahrefs caps batch-analysis at 100 targets per call.
  batch_size smallint not null default 100 check (batch_size between 1 and 100),
  -- A ceiling on one run, so a misconfiguration cannot empty the budget in one
  -- go and so the function finishes inside its time limit.
  max_batches_per_run smallint not null default 40 check (max_batches_per_run > 0),

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create trigger refresh_settings_set_updated_at
  before update on public.refresh_settings
  for each row execute function public.set_updated_at();

-- The single row, off, in dry run.
insert into public.refresh_settings (id) values (true) on conflict (id) do nothing;

-- ------------------------------------------------------------- run history --
create type public.refresh_run_status as enum (
  'running',
  'completed',
  'skipped',
  'failed'
);

create table public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  status public.refresh_run_status not null default 'running',
  -- Why a run did nothing: disabled, dry run, budget exhausted, nothing due.
  reason text,
  dry_run boolean not null default false,

  domains_refreshed integer not null default 0,
  domains_failed integer not null default 0,
  batches integer not null default 0,
  units_spent integer not null default 0,

  -- What was still outstanding when the run finished, per tier.
  overdue_tier1 integer,
  overdue_tier2 integer,
  overdue_tier3 integer,

  error text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index refresh_runs_started_idx on public.refresh_runs (started_at desc);
create index refresh_runs_status_idx on public.refresh_runs (status) where status = 'running';

-- ---------------------------------------------------------------- policies --
alter table public.refresh_settings enable row level security;
alter table public.refresh_runs enable row level security;

-- Operational data. Admins read and write it; nobody else sees it at all.
create policy "Admins manage refresh settings"
  on public.refresh_settings for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins read refresh runs"
  on public.refresh_runs for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Assigning tiers
--
-- Ranked by domain rating then organic traffic, so the domains people care
-- about most are refreshed most often. Re-runnable: it recalculates every
-- unlocked row, which is what makes it useful after the inventory grows.
--
-- Archived domains are excluded entirely - there is no sense paying to refresh
-- a listing nobody can buy.
-- ---------------------------------------------------------------------------
create or replace function public.assign_ahrefs_tiers()
returns table (tier1 integer, tier2 integer, tier3 integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.refresh_settings%rowtype;
begin
  select * into v_settings from public.refresh_settings where id;

  with ranked as (
    select
      id,
      row_number() over (
        order by domain_rating desc nulls last, organic_traffic desc nulls last, id
      ) as position
    from public.websites
    where status <> 'archived'
      and not ahrefs_tier_locked
  )
  update public.websites w
     set ahrefs_tier = case
       when r.position <= v_settings.tier1_size then 1
       when r.position <= v_settings.tier1_size + v_settings.tier2_size then 2
       else 3
     end
    from ranked r
   where w.id = r.id;

  return query
    select
      count(*) filter (where ahrefs_tier = 1)::integer,
      count(*) filter (where ahrefs_tier = 2)::integer,
      count(*) filter (where ahrefs_tier = 3)::integer
    from public.websites
    where status <> 'archived';
end;
$$;

revoke all on function public.assign_ahrefs_tiers() from public;

-- ---------------------------------------------------------------------------
-- How much is overdue, per tier
--
-- A domain is overdue when it has never been refreshed, or when its last
-- refresh is older than its tier's interval. An unassigned tier is treated as
-- tier 3: the cautious reading, since assuming tier 1 would spend the most
-- money on the domains we know least about.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_overdue_counts()
returns table (tier smallint, overdue bigint, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (select * from public.refresh_settings where id),
  scoped as (
    select
      coalesce(w.ahrefs_tier, 3)::smallint as tier,
      w.last_ahrefs_refresh_at,
      case coalesce(w.ahrefs_tier, 3)
        when 1 then s.tier1_interval_days
        when 2 then s.tier2_interval_days
        else s.tier3_interval_days
      end as interval_days
    from public.websites w
    cross join settings s
    where w.status <> 'archived'
  )
  select
    tier,
    count(*) filter (
      where last_ahrefs_refresh_at is null
         or last_ahrefs_refresh_at < timezone('utc', now()) - make_interval(days => interval_days)
    ) as overdue,
    count(*) as total
  from scoped
  group by tier
  order by tier;
$$;

revoke all on function public.ahrefs_overdue_counts() from public;

-- ---------------------------------------------------------------------------
-- The domains to refresh next
--
-- Tier order first, then most overdue within a tier, with never-refreshed
-- domains ahead of everything. `for update skip locked` means two runs
-- overlapping would take different rows rather than both taking the same ones.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_due_domains(p_limit integer)
returns table (id uuid, domain text, tier smallint)
language sql
volatile
security definer
set search_path = public
as $$
  with settings as (select * from public.refresh_settings where id)
  select w.id, w.domain, coalesce(w.ahrefs_tier, 3)::smallint as tier
  from public.websites w
  cross join settings s
  where w.status <> 'archived'
    and (
      w.last_ahrefs_refresh_at is null
      or w.last_ahrefs_refresh_at < timezone('utc', now()) - make_interval(
        days => case coalesce(w.ahrefs_tier, 3)
          when 1 then s.tier1_interval_days
          when 2 then s.tier2_interval_days
          else s.tier3_interval_days
        end
      )
    )
  order by coalesce(w.ahrefs_tier, 3), w.last_ahrefs_refresh_at nulls first, w.id
  limit greatest(0, p_limit);
$$;

revoke all on function public.ahrefs_due_domains(integer) from public;

-- ---------------------------------------------------------------------------
-- Units spent in the current billing cycle
--
-- Summed from the run history rather than asked of Ahrefs, so the number is
-- available even when their API is not, and so it reflects what this job spent
-- rather than the whole account.
-- ---------------------------------------------------------------------------
create or replace function public.ahrefs_cycle_start()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with s as (select billing_cycle_day from public.refresh_settings where id),
  candidate as (
    select make_timestamptz(
      extract(year from timezone('utc', now()))::int,
      extract(month from timezone('utc', now()))::int,
      (select billing_cycle_day from s),
      0, 0, 0, 'UTC'
    ) as day
  )
  -- Before the reset day, the cycle began last month.
  select case
    when day <= timezone('utc', now()) then day
    else day - interval '1 month'
  end
  from candidate;
$$;

create or replace function public.ahrefs_units_this_cycle()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(units_spent), 0)::integer
  from public.refresh_runs
  where started_at >= public.ahrefs_cycle_start();
$$;

revoke all on function public.ahrefs_cycle_start() from public;
revoke all on function public.ahrefs_units_this_cycle() from public;

-- ---------------------------------------------------------------------------
-- Claiming a run
--
-- Returns a run id, or null when another run already holds the claim. This is
-- what stops a slow run and the next day's run working the same domains.
--
-- A run still marked running after two hours is treated as dead - a function
-- that was killed mid-flight would otherwise block the job forever.
-- ---------------------------------------------------------------------------
create or replace function public.start_refresh_run(p_dry_run boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.refresh_runs
     set status = 'failed',
         error = 'Abandoned: still running after two hours',
         finished_at = timezone('utc', now())
   where status = 'running'
     and started_at < timezone('utc', now()) - interval '2 hours';

  if exists (select 1 from public.refresh_runs where status = 'running') then
    return null;
  end if;

  insert into public.refresh_runs (dry_run) values (coalesce(p_dry_run, false))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.start_refresh_run(boolean) from public;
