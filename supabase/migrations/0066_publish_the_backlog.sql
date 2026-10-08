-- ---------------------------------------------------------------------------
-- 0066  Publishing the backlog
--
-- 7,174 draft listings are priced and ready to go live. The way to publish
-- them is the admin table: tick them, press Publish, and the browser sends
-- twenty-five at a time.
--
-- That does not reach seven thousand. Each listing is read, its true costs are
-- read, `publishBlocker` is run against both and the row is updated - about
-- four round trips each, so a chunk of twenty-five is ten seconds and the
-- backlog is the best part of an hour with a browser tab that must stay open.
-- It is also the wrong shape: selecting seven thousand rows in a table that
-- shows twenty-five is not a thing a person should have to do.
--
-- So it becomes a run, the same arrangement the approve-all uses: a row that
-- records what is happening, a claim that stops two workers doing it twice,
-- and a cron slice with a time budget. The work is the same work - the guard
-- is still `publishBlocker`, still the only thing that decides - but it is
-- batched, and nobody has to watch it.
--
-- `publishBlocker` stays in TypeScript on purpose. It compares a sell price
-- against a converted cost including the rate card, which is the pricing
-- engine's arithmetic; a second copy of that in SQL would be the drift this
-- codebase keeps paying for. The function below only finds candidates - a
-- draft with something sellable on it - and the run reads them in batches and
-- asks the real guard.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.website_publish_runs (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'running'
    check (status in ('running', 'finished', 'cancelled', 'failed')),

  /* How many were publishable when the run started. The denominator the
     progress bar divides by, fixed at the start so it cannot move when
     somebody publishes one by hand mid-run. */
  total integer not null default 0,

  published integer not null default 0,
  skipped integer not null default 0,
  first_error text,

  /* Listings this run tried and could not publish.
     A refused listing stays a draft and would be a candidate again on the next
     slice, so without this the run would hand itself the same unpublishable
     listing for ever and never reach the end. */
  skipped_ids uuid[] not null default '{}',

  ticks integer not null default 0,
  claimed_at timestamptz,

  -- Who pressed it. Publishing is a commercial decision and the run is the
  -- record of which human made it and when.
  started_by text not null,

  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  status_reason text
);

comment on table public.website_publish_runs is
  'Background runs that publish ready draft listings. Internal only - no customer-facing policy exists, deliberately.';

alter table public.website_publish_runs enable row level security;

do $$
begin
  create policy "Admins manage website publish runs"
    on public.website_publish_runs for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Candidates.
--
-- A draft with at least one placement that is switched on and priced. That is
-- the `unpriced` and `priced-but-off` half of `publishBlocker`, which is
-- expressible here; the `below-cost` half is not, and is left to the run.
--
-- `p_exclude` carries the ones this run has already refused, so the slice
-- after it asks for different listings instead of the same ones again.
-- ---------------------------------------------------------------------------

create or replace function public.website_publish_candidates(
  p_limit integer default 100,
  p_exclude uuid[] default '{}'
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select w.id
  from public.websites w
  where w.status = 'draft'
    and not (w.id = any (p_exclude))
    and exists (
      select 1 from public.services s
      where s.website_id = w.id and s.available and s.price_minor > 0
    )
  order by w.id asc
  limit greatest(1, p_limit);
$$;

create or replace function public.website_publish_eligible_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.websites w
  where w.status = 'draft'
    and exists (
      select 1 from public.services s
      where s.website_id = w.id and s.available and s.price_minor > 0
    );
$$;

create or replace function public.claim_website_publish_run(p_stale_seconds integer default 600)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.website_publish_runs r
     set claimed_at = timezone('utc', now()),
         ticks = r.ticks + 1
   where r.id = (
     select c.id
       from public.website_publish_runs c
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
-- Who may call these.
--
-- `security definer` runs past row level security and PostgREST publishes every
-- public function as an RPC endpoint. Without these, an unauthenticated POST
-- could enumerate the unpublished inventory through the candidate list. Same
-- convention as 0057-0063.
-- ---------------------------------------------------------------------------

revoke all on function public.website_publish_candidates(integer, uuid[]) from public;
revoke all on function public.website_publish_candidates(integer, uuid[]) from anon;
revoke all on function public.website_publish_candidates(integer, uuid[]) from authenticated;

revoke all on function public.website_publish_eligible_count() from public;
revoke all on function public.website_publish_eligible_count() from anon;
revoke all on function public.website_publish_eligible_count() from authenticated;

revoke all on function public.claim_website_publish_run(integer) from public;
revoke all on function public.claim_website_publish_run(integer) from anon;
revoke all on function public.claim_website_publish_run(integer) from authenticated;
