-- ---------------------------------------------------------------------------
-- Undo 0061.
--
-- DESTROYS: nothing. It puts `different-site-offered` back in the bulk
-- approval exclusion list.
--
-- The cost of running it is the bug 0061 fixed. That flag is set on any
-- non-empty `relationship`, and against a real backlog it fired on 7,304
-- drafts out of 7,307 - "owner", "Site from the publisher's rate card",
-- "Agency/reseller offering guest posts". Reinstating it takes the priced rule
-- back to offering nothing at all.
--
-- The exclusion was built on the reading that "approving writes one site's
-- terms against another's row". The extraction rule says the opposite - "the
-- offered site IS the listing" - so the draft's domain was already the right
-- one and there was never a mismatch to catch.
--
-- Only run it alongside code where `flagsFor` still sets the flag, and even
-- then there is nothing to gain by it.
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
            public.draft_has_any_price(d.proposed)
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
            public.draft_has_any_price(d.proposed)
            and not (d.flags && array['price-without-currency', 'different-site-offered']::text[])
          else
            d.low_confidence_count = 0 and cardinality(d.flags) = 0
        end;
$$;
