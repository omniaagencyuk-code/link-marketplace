-- ---------------------------------------------------------------------------
-- Undo 0060.
--
-- DESTROYS: nothing. It narrows the priced rule back to `guest_post_cost`
-- alone and drops the helper.
--
-- The cost of running it is the bug 0060 fixed: a publisher who quoted a price
-- for writing the article themselves, or who only sells link insertions, has
-- no `guest_post_cost` and stops being approvable in bulk. Against a real
-- backlog that was the difference between 1,132 drafts and several thousand.
--
-- Nothing already approved is affected. Only run it alongside code from before
-- 0060 - which is to say, don't: there is no version of this that is correct
-- and this one is not.
-- ---------------------------------------------------------------------------

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

drop function if exists public.draft_has_any_price(jsonb);
