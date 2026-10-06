-- ---------------------------------------------------------------------------
-- 0054  The link gap finder
--
-- A customer names their own domain and up to three competitors; we find the
-- referring domains linking to a competitor but not to them, and mark the ones
-- we can actually sell.
--
-- Every table here exists because of one fact about the cost. Measured against
-- the live API rather than assumed:
--
--   units-cost-row  = the number of columns selected
--   units-cost-total = max(50, rows x columns)
--
-- So a pull costs one unit per referring domain when a single column is
-- selected, with a fifty-unit floor per request. The consequence is that the
-- bill is set by the *competitor's* backlink profile, and the customer chooses
-- the competitor: three big competitors at fifty thousand referring domains
-- each is 150,000 units from one form submission, against a monthly allowance
-- of two million that the nightly refresh is already drawing on.
--
-- Four things follow, and they are the whole design.
--
--   The budget is separate. `gap_settings` has its own allowance and its own
--   ceiling, and the guard refuses when *that* is spent. It never borrows from
--   the refresh - a predictable background cost and an unbounded customer-
--   facing one must not share a pot, or the first busy week stops the
--   marketplace's figures updating.
--
--   Rows are capped per target, so one enormous competitor costs what a
--   middling one costs.
--
--   Pulls are cached by domain. Referring-domain sets move slowly and
--   competitors repeat heavily: ten affiliates in one niche name the same five
--   competitors, and the second customer onwards pays nothing for them.
--
--   Every call is written to a ledger with what Ahrefs actually charged, read
--   back from the response. The budget is summed from that, never estimated -
--   the rule 0014 arrived at after the refresh spent a month computing its own
--   spend from a number that stopped being true.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- settings --

create table if not exists public.gap_settings (
  id boolean primary key default true check (id),

  enabled boolean not null default false,

  -- The feature's own allowance, in Ahrefs units, per cycle. Nothing here can
  -- spend against the refresh's budget.
  monthly_unit_budget integer not null default 500000 check (monthly_unit_budget >= 0),
  unit_safety_pct smallint not null default 90 check (unit_safety_pct between 1 and 100),
  billing_cycle_day smallint not null default 1 check (billing_cycle_day between 1 and 28),

  -- The cap that makes one enormous competitor cost what a middling one costs.
  rows_per_target integer not null default 2500 check (rows_per_target between 100 and 25000),
  max_competitors smallint not null default 3 check (max_competitors between 1 and 5),

  -- How long a pull stays usable. Referring-domain sets move slowly; a month
  -- old is a better answer than a bill.
  cache_days smallint not null default 30 check (cache_days between 1 and 180),

  -- Per account, per cycle. The other half of the abuse guard: the budget
  -- stops the feature, this stops one customer consuming all of it.
  runs_per_account smallint not null default 5 check (runs_per_account >= 0),

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.gap_settings (id) values (true) on conflict (id) do nothing;

comment on table public.gap_settings is
  'Governs the link gap finder. Admin only. Its unit budget is separate from the refresh''s and cannot borrow from it.';

-- ------------------------------------------------------------ the cache --
--
-- One row per domain we have pulled referring domains for, with the domains
-- themselves held as an array.
--
-- An array rather than a child table with a row per referring domain: a child
-- table is two and a half thousand rows per snapshot and millions overall, to
-- support a question - "which of these are in our inventory" - that is one
-- `unnest` and a join either way. Postgres stores a large array out of line
-- without being asked.

create table if not exists public.refdomain_snapshots (
  domain text primary key,

  -- The referring domains, strongest first, already normalised.
  domains text[] not null default '{}',

  row_count integer not null default 0,
  -- True when the cap was hit, so the set is the top N rather than all of
  -- them. A gap computed from a truncated set is still useful and is not the
  -- same claim, and the UI says so.
  truncated boolean not null default false,

  units_charged integer not null default 0,
  fetched_at timestamptz not null default timezone('utc', now())
);

create index if not exists refdomain_snapshots_fetched_idx
  on public.refdomain_snapshots (fetched_at desc);

comment on table public.refdomain_snapshots is
  'Cached referring-domain pulls. Internal - it is our purchased data and our cost, and no customer-facing policy exists.';

-- ------------------------------------------------------------- the ledger --
--
-- One row per Ahrefs call, carrying what Ahrefs actually charged. The budget
-- is summed from here.

create table if not exists public.gap_lookups (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,

  target text not null,
  rows_returned integer not null default 0,
  units_charged integer not null default 0 check (units_charged >= 0),

  -- A pull served from the cache costs nothing and is recorded as such, so
  -- "how often did the cache save us" is answerable.
  from_cache boolean not null default false,

  http_status smallint,
  error text,

  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists gap_lookups_created_idx on public.gap_lookups (created_at desc);

comment on table public.gap_lookups is
  'One row per referring-domain call, with what Ahrefs charged. The gap budget is summed from here - never estimated.';

-- ---------------------------------------------------------------- the runs --

do $$
begin
  create type public.gap_run_status as enum ('running', 'completed', 'failed', 'refused');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.gap_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  target_domain text not null,
  competitor_domains text[] not null default '{}',

  status public.gap_run_status not null default 'running',
  -- Why it was refused or how it failed. Shown to the customer, so it says
  -- what they can do rather than what our budget is.
  status_reason text,

  gaps_found integer not null default 0,
  -- Of those, the ones we can sell. The only number with money attached.
  sellable_found integer not null default 0,

  units_spent integer not null default 0,
  cache_hits smallint not null default 0,
  /* True when any target's pull was capped, so the report can say the set is
     the strongest N rather than all of them. */
  truncated boolean not null default false,

  created_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists gap_runs_user_idx on public.gap_runs (user_id, created_at desc);
create index if not exists gap_runs_created_idx on public.gap_runs (created_at desc);

-- -------------------------------------------------------------- the result --

create table if not exists public.gap_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.gap_runs (id) on delete cascade,

  domain text not null,

  -- Set when the gap is a site we sell. Null is the ordinary case: most of a
  -- competitor's backlinks are not ours to offer.
  website_id uuid references public.websites (id) on delete set null,

  -- Which of the named competitors this domain links to. The evidence for the
  -- row being here at all.
  linking_competitors text[] not null default '{}',

  created_at timestamptz not null default timezone('utc', now()),

  unique (run_id, domain)
);

create index if not exists gap_results_run_idx on public.gap_results (run_id);
create index if not exists gap_results_sellable_idx
  on public.gap_results (run_id) where website_id is not null;

-- ------------------------------------------------------------- updated_at --

do $$
begin
  create trigger gap_settings_set_updated_at
    before update on public.gap_settings
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------- policies --
--
-- Three of these tables are internal and get the admin-only treatment AGENTS.md
-- requires: the cache is data we paid for, the ledger is our cost, the settings
-- are our budget.
--
-- The runs and their results are different: they are the customer's own
-- output, and a customer reads their own. That is the first customer-facing
-- policy this feature has, so it is scoped to `user_id` and nothing else - a
-- gap report names which of our sites link to a competitor, which is the
-- product, and never what that site costs us.

alter table public.gap_settings enable row level security;
alter table public.refdomain_snapshots enable row level security;
alter table public.gap_lookups enable row level security;
alter table public.gap_runs enable row level security;
alter table public.gap_results enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['gap_settings', 'refdomain_snapshots', 'gap_lookups', 'gap_runs', 'gap_results']
  loop
    begin
      execute format(
        'create policy "Admins manage %1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())',
        t
      );
    exception when duplicate_object then null;
    end;
  end loop;
end;
$$;

do $$
begin
  create policy "Customers read their own gap runs"
    on public.gap_runs for select
    using (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers read their own gap results"
    on public.gap_results for select
    using (
      exists (
        select 1 from public.gap_runs r
        where r.id = gap_results.run_id
          and r.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The cycle, and what has been spent in it
--
-- Summed from the ledger, in the shape `ahrefs_units_this_cycle` uses - and
-- deliberately a different sum from that one. Two budgets, two ledgers, so a
-- busy week of gap reports cannot stop the marketplace's figures updating.
-- ---------------------------------------------------------------------------
create or replace function public.gap_cycle_start()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with s as (select billing_cycle_day from public.gap_settings where id),
  candidate as (
    select make_timestamptz(
      extract(year from timezone('utc', now()))::int,
      extract(month from timezone('utc', now()))::int,
      (select billing_cycle_day from s),
      0, 0, 0, 'UTC'
    ) as day
  )
  select case
    when day <= timezone('utc', now()) then day
    else day - interval '1 month'
  end
  from candidate;
$$;

create or replace function public.gap_units_this_cycle()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(units_charged), 0)::integer
  from public.gap_lookups
  where created_at >= public.gap_cycle_start();
$$;

/* How many reports this account has run in the cycle. The other half of the
   guard: the budget stops the feature, this stops one customer taking all of
   it before anybody else gets a turn. */
create or replace function public.gap_runs_this_cycle(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.gap_runs
  where user_id = p_user
    and created_at >= public.gap_cycle_start()
    and status <> 'refused';
$$;

revoke all on function public.gap_cycle_start() from public;
revoke all on function public.gap_cycle_start() from anon;
revoke all on function public.gap_units_this_cycle() from public;
revoke all on function public.gap_units_this_cycle() from anon;
revoke all on function public.gap_units_this_cycle() from authenticated;
revoke all on function public.gap_runs_this_cycle(uuid) from public;
revoke all on function public.gap_runs_this_cycle(uuid) from anon;

-- ---------------------------------------------------------------------------
-- Which of these domains we can actually sell
--
-- The commercial half of the whole feature, done in the database because it is
-- a set intersection over a few thousand strings and doing it in application
-- code means reading the whole inventory to answer it.
--
-- Only active, priced listings count. A gap we cannot sell today is a gap, not
-- an offer, and listing a paused site as available is a promise somebody has
-- to retract.
-- ---------------------------------------------------------------------------
create or replace function public.gap_sellable(p_domains text[])
returns table (website_id uuid, domain text, domain_rating smallint, organic_traffic integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.domain, w.domain_rating, w.organic_traffic
  from public.websites w
  where w.status = 'active'
    and w.domain = any (p_domains);
$$;

revoke all on function public.gap_sellable(text[]) from public;
revoke all on function public.gap_sellable(text[]) from anon;
revoke all on function public.gap_sellable(text[]) from authenticated;
