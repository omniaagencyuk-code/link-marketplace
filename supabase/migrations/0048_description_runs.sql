-- ---------------------------------------------------------------------------
-- 0048  Filling site descriptions as a background job
--
-- The button filled two hundred listings per press and asked to be pressed
-- again. Two hundred is not a database limit or a politeness limit - it is the
-- serverless clock. Eight homepages at a time, up to twelve seconds each, is
-- about three hundred seconds for two hundred domains, and three hundred
-- seconds is where the function is killed. So the work has to outlive the
-- request that asked for it.
--
-- ## The bug that made it worse than it looked
--
-- A run asked for listings whose description is still blank. A homepage that
-- answers with boilerplate fills nothing, so that listing is still blank when
-- the next run asks the same question - and the next run fetched it again.
-- Of the two hundred in a press, roughly a hundred and twenty find nothing,
-- and every one of them was re-fetched on the following press, ahead of
-- listings that had never been tried. The sweep got slower the further it got,
-- and would never have finished.
--
-- `description_checked_at` is the fix: a run sweeps each listing at most once,
-- because it asks for listings nothing has looked at since the run began. A
-- later run still retries them, which is the behaviour that was wanted -
-- sites get redesigned - but within one sweep each domain is tried once.
--
-- ## One run at a time, claimed by whoever picks it up
--
-- The run is a row. The admin button creates it and does the first slice; a
-- cron does the rest, which is what makes it carry on after somebody closes
-- the tab. Both go through `claim_description_run`, so a cron tick that
-- overlaps a manual one does not double-fetch every domain in the slice.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- When each listing was last looked at
--
-- Null means never. Set whatever the outcome - found, found nothing, could not
-- be reached - because the question it answers is "has this sweep tried you
-- yet", not "did it work".
-- ---------------------------------------------------------------------------
alter table public.websites
  add column if not exists description_checked_at timestamptz;

comment on column public.websites.description_checked_at is
  'When a description sweep last read this homepage, whatever the outcome. Null means never. Stops one sweep re-fetching the domains that yielded nothing.';

-- The selection every slice makes: still blank, not yet tried by this run.
create index if not exists websites_description_sweep_idx
  on public.websites (description_checked_at nulls first)
  where status <> 'archived';

-- ---------------------------------------------------------------------------
-- The run itself
-- ---------------------------------------------------------------------------
create table if not exists public.description_runs (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'running'
    check (status in ('running', 'finished', 'cancelled', 'failed')),

  -- How many listings were blank when the run started. The denominator the
  -- progress bar divides by, fixed at the start so the bar cannot go
  -- backwards when a listing is edited mid-run.
  total integer not null default 0,

  looked integer not null default 0,
  filled integer not null default 0,
  nothing_useful integer not null default 0,
  failed integer not null default 0,
  first_error text,

  -- How many slices have run. Only for reading the logs afterwards.
  ticks integer not null default 0,

  /*
    Who is working on it at the moment.

    A slice claims the run before it starts and releases it when it stops. A
    claim older than the stale window is treated as abandoned, which is what
    makes a run survive a function that was killed mid-slice rather than
    leaving it claimed forever.
  */
  claimed_at timestamptz,

  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  started_by text
);

create index if not exists description_runs_started_idx
  on public.description_runs (started_at desc);

/*
  One run at a time.

  A unique index on a constant, limited to running rows: two runs sweeping the
  same listings would each fetch half of them twice and report half the
  progress. The admin action reads this as "one is already going" rather than
  starting a second.
*/
create unique index if not exists description_runs_one_running_idx
  on public.description_runs ((true)) where status = 'running';

-- ---------------------------------------------------------------------------
-- Claiming the run
--
-- `for update skip locked` so two workers arriving together do not both get
-- it: the second finds the row locked, skips it and gets nothing back, which
-- is exactly the answer it should act on.
-- ---------------------------------------------------------------------------
create or replace function public.claim_description_run(p_stale_seconds integer default 600)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.description_runs r
     set claimed_at = timezone('utc', now()),
         ticks = r.ticks + 1
   where r.id = (
     select c.id
       from public.description_runs c
      where c.status = 'running'
        and (
          c.claimed_at is null
          or c.claimed_at < timezone('utc', now()) - make_interval(secs => greatest(60, p_stale_seconds))
        )
      order by c.started_at
      for update skip locked
      limit 1
   )
  returning r.id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which listings a slice should read next
--
-- In SQL rather than as PostgREST filters, because the condition is a
-- conjunction of two disjunctions - blank description, and not yet seen by
-- this run - and expressing that over the wire needs two `or=` parameters
-- whose combination is not something worth being unsure about. Getting it
-- subtly wrong does not fail: it quietly hands back listings that already have
-- a description and the sweep spends its hour re-reading them.
--
-- Here it is one statement, it is readable, and it can be tested against a
-- real database.
--
-- Never-checked listings come first, then the ones checked longest ago, so a
-- sweep works through the untouched inventory before retrying anything.
-- ---------------------------------------------------------------------------
create or replace function public.description_sweep_batch(
  p_since timestamptz,
  p_limit integer default 40
)
returns table (id uuid, domain text)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.domain
    from public.websites w
   where w.status <> 'archived'
     and (w.description is null or w.description = '')
     and (w.description_checked_at is null or w.description_checked_at < p_since)
   order by w.description_checked_at asc nulls first, w.id asc
   limit greatest(1, least(500, p_limit));
$$;

revoke all on function public.description_sweep_batch(timestamptz, integer) from public;
revoke all on function public.description_sweep_batch(timestamptz, integer) from anon;
revoke all on function public.description_sweep_batch(timestamptz, integer) from authenticated;

revoke all on function public.claim_description_run(integer) from public;
revoke all on function public.claim_description_run(integer) from anon;
revoke all on function public.claim_description_run(integer) from authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Operational data, like `refresh_runs` beside it. The admin area reads and
-- writes it through the service role; nobody else sees it at all.
-- ---------------------------------------------------------------------------
alter table public.description_runs enable row level security;
