-- ---------------------------------------------------------------------------
-- 0059  Approving everything that carries a price
--
-- 0058 let the whole queue be approved in one press, under the rules the
-- hundred-at-a-time button already used: no low-confidence field, nothing
-- flagged. Against a real backlog that turned out to be 17 drafts out of
-- 7,204. The rules were not wrong, they were one bucket where there should
-- have been two.
--
-- Of the five flags, three mean "somebody should look" and two mean "this data
-- is wrong":
--
--   single-price-confirm-niches  one price, no sensitive niche mentioned
--   no-contact-email             no address in the reply
--   price-changes-later          a price with a stated expiry
--
-- all record perfectly good terms. A publisher quoting one number and never
-- mentioning gambling is the ordinary case, not an anomaly.
--
--   price-without-currency       a number with no unit. Stored anyway once,
--                                and read as pounds everywhere downstream,
--                                which is how a publisher quoting dollars came
--                                to be shown as quoting pounds.
--   different-site-offered       the reply is about a different domain than
--                                the draft. Approving writes one site's terms
--                                against another's row.
--
-- Those two are excluded in both modes. They are not a judgement about how
-- careful to be; the row would be wrong.
--
-- `priced` mode therefore asks for one thing the strict mode does not: a
-- general price. A draft with no `guest_post_cost` has nothing to record and
-- nothing to spread across niches, so it is the one case that still needs a
-- person.
--
-- The run remembers which rules it used and whether niches were spread,
-- because "approved as confident" and "approved under the priced rule with the
-- general price applied to every unmentioned niche" are different claims about
-- the same listing, and the second is one somebody chose to make.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

alter table public.draft_approval_runs
  add column if not exists mode text not null default 'confident';

do $$
begin
  alter table public.draft_approval_runs
    add constraint draft_approval_runs_mode_known
    check (mode in ('confident', 'priced'));
exception when duplicate_object then null;
end;
$$;

/* Whether the general price was applied to unmentioned sensitive niches.
   `applyGeneralPriceToNiches` is a reviewer's decision made explicit, and it
   never overrides an explicit refusal - a publisher who said "no gambling" has
   not been talked round by a button. This records that the decision was made. */
alter table public.draft_approval_runs
  add column if not exists spread_niches boolean not null default false;

-- ---------------------------------------------------------------------------
-- Which drafts an approve-all may touch, in either mode
--
-- Dropped and recreated rather than overloaded: a second function with the old
-- signature left callable is a way for an old caller to keep getting the old
-- answer long after everyone believes it is gone.
-- ---------------------------------------------------------------------------
drop function if exists public.draft_approval_batch(integer, uuid[]);

create or replace function public.draft_approval_batch(
  p_limit integer default 25,
  p_exclude uuid[] default '{}',
  p_relaxed boolean default false
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
    and not (d.id = any (p_exclude))
    and not exists (select 1 from contested x where x.domain = d.domain)
    and case
          when p_relaxed then
            (d.proposed ->> 'guest_post_cost') is not null
            and not (d.flags && array['price-without-currency', 'different-site-offered']::text[])
          else
            d.low_confidence_count = 0 and cardinality(d.flags) = 0
        end
  order by d.id asc
  limit greatest(1, p_limit);
$$;

revoke all on function public.draft_approval_batch(integer, uuid[], boolean) from public;
revoke all on function public.draft_approval_batch(integer, uuid[], boolean) from anon;
revoke all on function public.draft_approval_batch(integer, uuid[], boolean) from authenticated;

drop function if exists public.draft_approval_eligible_count();

create or replace function public.draft_approval_eligible_count(
  p_relaxed boolean default false
)
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
    and not exists (select 1 from contested x where x.domain = d.domain)
    and case
          when p_relaxed then
            (d.proposed ->> 'guest_post_cost') is not null
            and not (d.flags && array['price-without-currency', 'different-site-offered']::text[])
          else
            d.low_confidence_count = 0 and cardinality(d.flags) = 0
        end;
$$;

revoke all on function public.draft_approval_eligible_count(boolean) from public;
revoke all on function public.draft_approval_eligible_count(boolean) from anon;
revoke all on function public.draft_approval_eligible_count(boolean) from authenticated;
