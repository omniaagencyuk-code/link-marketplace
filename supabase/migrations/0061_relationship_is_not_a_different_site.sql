-- ---------------------------------------------------------------------------
-- 0061  A relationship note is not a different site
--
-- With 0060 in place the priced rule still offered nothing: 7,304 of 7,307
-- pending drafts were excluded, and only 2 of them lack a currency. The whole
-- backlog was being held back by `different-site-offered`.
--
-- That flag is set on any non-empty `relationship`, and what the model writes
-- there is how the publisher relates to the domain:
--
--   Site from the publisher's own rate card (network of ~2,000 sites)   2,708
--   owner                                                               1,020
--   Site from the publisher's rate card                                   404
--   Agency/reseller offering guest posts and link insertions              381
--   Site in the Sun Media Brands network                                  242
--
-- None of that means the draft is about the wrong domain, and the extraction
-- rule it was built on says the opposite:
--
--   "If the publisher declines for the site we asked about but offers
--    another, THE OFFERED SITE IS THE LISTING and 'relationship' says so."
--
-- The draft's domain is already the offered site. 0059 excluded this flag on
-- the stated grounds that "approving writes one site's terms against
-- another's row", which the rule shows was never true - the exclusion was
-- built on a misreading, and the cost of it was the entire queue.
--
-- `price-without-currency` stays excluded. That one is real: a number with no
-- unit, and it affects two drafts rather than seven thousand.
--
-- `review.ts` stops setting the flag in the same change, so this is about the
-- 7,304 drafts already carrying it. They are unblocked without being re-read,
-- which matters: re-extraction is an API bill, and nothing about them was
-- wrong.
--
-- Written to survive being run twice.
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
            and not (d.flags && array['price-without-currency']::text[])
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
            and not (d.flags && array['price-without-currency']::text[])
          else
            d.low_confidence_count = 0 and cardinality(d.flags) = 0
        end;
$$;
