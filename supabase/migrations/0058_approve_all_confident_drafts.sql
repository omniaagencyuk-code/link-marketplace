-- ---------------------------------------------------------------------------
-- 0058  Approving the whole queue, rather than a hundred at a time
--
-- `bulkApproveConfidentAction` already decides what may be swept up: a draft
-- with no low-confidence field, no reviewer flag, and no second offer for the
-- same domain. What it cannot do is finish. The browser names a hundred drafts
-- per request because a serverless function dies at three hundred seconds, and
-- an approval is several round trips - so eight thousand drafts is somebody
-- sitting with a tab open pressing a button forty times.
--
-- This makes it a run, the same shape the description sweep uses: a row, a
-- slice every few minutes, carried on by cron after whoever started it has
-- closed the laptop.
--
-- **The rules do not change.** They move into SQL, which is the point: the
-- flags filter was applied in JavaScript because "comparing a text[] column to
-- an empty array through PostgREST is fiddly enough to get subtly wrong, and
-- getting it wrong in this direction would bulk-approve the flagged drafts
-- this action exists to leave alone". In SQL it is `cardinality(flags) = 0`.
-- Contested domains were worked out per request and passed in; here they are a
-- `having count(*) > 1` the batch cannot be called without.
--
-- Nothing here approves anything. `draft_approval_batch` chooses which drafts
-- are eligible; `draft-approval.ts` remains the only path from a draft to a
-- listing, and it still runs once per draft with a named reviewer.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.draft_approval_runs (
  id uuid primary key default gen_random_uuid(),

  status text not null default 'running'
    check (status in ('running', 'finished', 'cancelled', 'failed')),

  /* How many were eligible when the run started. The denominator the progress
     bar divides by, fixed at the start so it cannot go backwards when a draft
     is flagged or contested mid-run. */
  total integer not null default 0,

  approved integer not null default 0,
  failed integer not null default 0,
  first_error text,

  /* Drafts this run tried and could not approve.
     `listing_drafts.status` has no failed state - it is pending, approved,
     rejected or merged - so a draft that throws stays pending and is eligible
     again on the next slice. Without this the run would hand itself the same
     broken draft for ever and never reach the end of the queue. */
  failed_ids uuid[] not null default '{}',

  ticks integer not null default 0,
  claimed_at timestamptz,

  -- Who pressed it. An approve-all is still one human pressing Approve, and
  -- the run is the record of which human and when.
  started_by text not null,

  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  status_reason text
);

create index if not exists draft_approval_runs_status_idx
  on public.draft_approval_runs (status, started_at desc);

comment on table public.draft_approval_runs is
  'One press of Approve all, carried on by cron. Admin-only: it is a record of our own review work.';

alter table public.draft_approval_runs enable row level security;

do $$
begin
  create policy "Admins manage draft approval runs"
    on public.draft_approval_runs for all
    using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which drafts an approve-all may touch
--
-- All three conditions, in one place, so no caller can approve a flagged
-- draft by forgetting a filter.
--
-- Ordered by id and selecting only `pending` means the walk needs no offset:
-- an approved draft leaves the pending set, so the next call naturally returns
-- the next ones. `p_exclude` carries the run's failures, which do not leave it.
-- ---------------------------------------------------------------------------
create or replace function public.draft_approval_batch(
  p_limit integer default 25,
  p_exclude uuid[] default '{}'
)
returns table (
  id uuid,
  domain text,
  email_id uuid,
  matched_website_id uuid,
  proposed jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with contested as (
    select c.domain
    from public.listing_drafts c
    where c.status in ('pending', 'approved')
    group by c.domain
    having count(*) > 1
  )
  select d.id, d.domain, d.email_id, d.matched_website_id, d.proposed
  from public.listing_drafts d
  where d.status = 'pending'
    and d.low_confidence_count = 0
    and cardinality(d.flags) = 0
    and not (d.id = any (p_exclude))
    and not exists (select 1 from contested x where x.domain = d.domain)
  order by d.id asc
  limit greatest(1, p_limit);
$$;

revoke all on function public.draft_approval_batch(integer, uuid[]) from public;
revoke all on function public.draft_approval_batch(integer, uuid[]) from anon;
revoke all on function public.draft_approval_batch(integer, uuid[]) from authenticated;

-- How many there are to do, by exactly the same rules. Used for the
-- denominator, and for the button to say what it is about to approve.
create or replace function public.draft_approval_eligible_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with contested as (
    select c.domain
    from public.listing_drafts c
    where c.status in ('pending', 'approved')
    group by c.domain
    having count(*) > 1
  )
  select count(*)::integer
  from public.listing_drafts d
  where d.status = 'pending'
    and d.low_confidence_count = 0
    and cardinality(d.flags) = 0
    and not exists (select 1 from contested x where x.domain = d.domain);
$$;

revoke all on function public.draft_approval_eligible_count() from public;
revoke all on function public.draft_approval_eligible_count() from anon;
revoke all on function public.draft_approval_eligible_count() from authenticated;

-- ---------------------------------------------------------------------------
-- Claiming a run
--
-- Identical to `claim_description_run`: a slice claims before it starts and a
-- claim older than the stale window is treated as abandoned, which is what
-- lets a run survive a function killed mid-slice instead of staying claimed
-- for ever. `for update skip locked` so two overlapping ticks cannot both take
-- the same run and approve everything twice.
-- ---------------------------------------------------------------------------
create or replace function public.claim_draft_approval_run(p_stale_seconds integer default 600)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.draft_approval_runs r
     set claimed_at = timezone('utc', now()),
         ticks = r.ticks + 1
   where r.id = (
     select c.id
       from public.draft_approval_runs c
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

revoke all on function public.claim_draft_approval_run(integer) from public;
revoke all on function public.claim_draft_approval_run(integer) from anon;
revoke all on function public.claim_draft_approval_run(integer) from authenticated;
