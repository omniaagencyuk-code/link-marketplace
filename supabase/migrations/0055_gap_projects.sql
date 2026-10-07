-- ---------------------------------------------------------------------------
-- 0055  Saved sites, and suggested competitors
--
-- Two additions to the gap finder, both of which make it cheaper rather than
-- more expensive.
--
-- A **project** is a site somebody runs reports on - their own, or a client's.
-- An agency sets one up once with its competitors and re-runs it monthly. The
-- saving is not the typing: the same competitors stay in the referring-domain
-- cache, so the second and subsequent runs for a project cost close to
-- nothing.
--
-- **Suggested competitors** come from Ahrefs' organic competitors endpoint,
-- which ranks other sites by how many keywords they share with the target.
-- Measured at fifty units a call - the per-request floor, because only a
-- handful of rows are wanted - against the 5,000 a referring-domain pull
-- costs. (That second figure read 2,500 when this migration was written: the
-- pull is charged for two columns a row, not one, because `order_by` is
-- charged for as well. Measured afterwards; see `COLUMNS_CHARGED`.) So suggesting is effectively free, and it replaces the thing it
-- would otherwise be tempting to do: ask a model to name competitors, which
-- it cannot know and would invent. An invented competitor is not just a wrong
-- answer, it is a real 2,500-unit pull against a site nobody competes with.
--
-- Suggestions are stored rather than used: the customer confirms them before
-- anything expensive runs.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.gap_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  -- What they call it. A client name, usually - the domain is not always
  -- recognisable to whoever is working through a list of twenty.
  name text not null,
  domain text not null,

  competitor_domains text[] not null default '{}',

  /* Which market to read competitors in. A UK affiliate and a US one have
     different competitors for the same keywords, and the suggestion endpoint
     takes a country rather than inferring one. */
  country char(2) not null default 'gb',

  last_run_at timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- One project per site per customer. Two rows for the same client is two
  -- sets of competitors drifting apart.
  unique (user_id, domain)
);

create index if not exists gap_projects_user_idx
  on public.gap_projects (user_id, updated_at desc);

comment on table public.gap_projects is
  'A site a customer runs gap reports on - their own or a client''s. Readable and writable only by its owner.';

-- The run can say which project it came from, so a project's history is a
-- query rather than a guess from matching domains.
alter table public.gap_runs
  add column if not exists project_id uuid references public.gap_projects (id) on delete set null;

create index if not exists gap_runs_project_idx on public.gap_runs (project_id, created_at desc);

do $$
begin
  create trigger gap_projects_set_updated_at
    before update on public.gap_projects
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------- policies --
--
-- A project is the customer's own, so unlike the internal tables in 0054 this
-- one gets full customer access - but scoped to `user_id` on every operation,
-- including the `with check` on writes. Without that second half a customer
-- could update somebody else's project to point at their own account.

alter table public.gap_projects enable row level security;

do $$
begin
  create policy "Admins manage gap projects"
    on public.gap_projects for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers manage their own gap projects"
    on public.gap_projects for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- What kind of call a ledger row was
--
-- The ledger exists to be summed for the budget, and a suggestion lookup
-- counts against it like anything else. But an admin reading it wants a second
-- answer the sum cannot give - what are we spending it *on* - and without this
-- a fifty-unit suggestion and a 2,500-unit referring-domain pull are two rows
-- for the same domain with nothing to tell them apart.
--
-- Defaulted rather than back-filled: every row written before now was a
-- referring-domain pull, because nothing else existed to write one.
-- ---------------------------------------------------------------------------

alter table public.gap_lookups
  add column if not exists kind text not null default 'refdomains';

do $$
begin
  alter table public.gap_lookups
    add constraint gap_lookups_kind_known
    check (kind in ('refdomains', 'competitors'));
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The suggestion cache
--
-- Suggestions are cached for the same reason referring-domain pulls are, and
-- on the same freshness window: who competes with a site for keywords does not
-- change week to week, and a button that costs fifty units every time somebody
-- clicks it is a button people click twice.
--
-- Keyed by domain *and* country because they are different answers. A UK
-- affiliate and a US one ranking for the same terms have different rivals, and
-- a cache that ignored the market would hand one the other's.
--
-- Internal on the same terms as `refdomain_snapshots`: it holds what Ahrefs
-- charged us. The suggestions themselves reach the customer through the
-- service role, not through a policy.
-- ---------------------------------------------------------------------------

create table if not exists public.competitor_suggestions (
  domain text not null,
  country char(2) not null default 'gb',

  /* `[{ "domain": "rival.com", "keywords_common": 1357, "domain_rating": 85 }]`,
     strongest first. Stored as returned rather than as three parallel arrays:
     nothing joins against it, and one shape is easier to read back than
     three to keep aligned. */
  suggestions jsonb not null default '[]'::jsonb,

  units_charged integer not null default 0 check (units_charged >= 0),
  fetched_at timestamptz not null default timezone('utc', now()),

  primary key (domain, country)
);

comment on table public.competitor_suggestions is
  'Cached organic competitors per domain and market, with what the lookup cost. Admin-only: the customer sees the suggestions, not the bill.';

alter table public.competitor_suggestions enable row level security;

do $$
begin
  create policy "Admins manage competitor suggestions"
    on public.competitor_suggestions for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end;
$$;
