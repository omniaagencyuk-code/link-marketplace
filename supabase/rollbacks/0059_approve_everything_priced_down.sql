-- ---------------------------------------------------------------------------
-- Undo 0059.
--
-- DESTROYS: the record of which rule each approve-all run used and whether it
-- applied the general price to unmentioned niches. The runs themselves and the
-- listings they created survive; what is lost is the distinction between
-- "approved as confident" and "approved under the priced rule with niches
-- spread", which is the more consequential of the two and cannot be
-- reconstructed from the listings afterwards. Export `draft_approval_runs`
-- first if that distinction ever has to be defended.
--
-- The eligibility functions go back to their 0058 signatures - strict only. In
-- practice that means approve-all matches almost nothing again: against a real
-- backlog the strict rule took 17 drafts out of 7,204.
--
-- Only run it alongside 0058-era code. The current code calls both functions
-- with a mode argument and reads `mode` and `spread_niches` off the run, so
-- with this applied an approve-all fails outright rather than quietly
-- approving the wrong set - which is the safer of the two failures.
-- ---------------------------------------------------------------------------

drop function if exists public.draft_approval_batch(integer, uuid[], boolean);
drop function if exists public.draft_approval_eligible_count(boolean);

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

revoke all on function public.draft_approval_batch(integer, uuid[]) from public;
revoke all on function public.draft_approval_batch(integer, uuid[]) from anon;
revoke all on function public.draft_approval_batch(integer, uuid[]) from authenticated;
revoke all on function public.draft_approval_eligible_count() from public;
revoke all on function public.draft_approval_eligible_count() from anon;
revoke all on function public.draft_approval_eligible_count() from authenticated;

alter table public.draft_approval_runs drop constraint if exists draft_approval_runs_mode_known;
alter table public.draft_approval_runs drop column if exists spread_niches;
alter table public.draft_approval_runs drop column if exists mode;
