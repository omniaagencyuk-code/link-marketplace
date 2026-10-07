-- ---------------------------------------------------------------------------
-- 0060  "States a price" means any of the five, not one of them
--
-- 0059 opened approve-all to everything carrying a price and, against the real
-- backlog, offered 1,132 drafts where something closer to five thousand was
-- expected. The rule asked for `guest_post_cost` and nothing else.
--
-- There are five price fields, and `extraction-rules.ts` says why the first
-- two are separate:
--
--   "guest_post_cost" is ALWAYS the price when we supply the article.
--   "guest_post_cost_written_by_publisher" is the price when they write it.
--
-- So a publisher who quoted a price for writing it themselves has no
-- `guest_post_cost` at all, and nor does one who only sells link insertions -
-- which is most of a niche-edit inventory. Both were excluded by a rule that
-- was meant to exclude only drafts with no price anywhere.
--
-- `hasAnyPrice()` in `sourcing/review.ts` has always defined this correctly,
-- across all five fields and the sensitive-niche prices as well. 0059
-- hand-rolled a narrower version beside it instead of mirroring it - the same
-- "every caller reassembles the rule" mistake that 0058 moved these conditions
-- into SQL to stop. This restates `hasAnyPrice` exactly, and the SQL test now
-- covers each field on its own so the two cannot drift apart again.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.draft_has_any_price(p_proposed jsonb)
returns boolean
language sql
immutable
as $$
  select
    (p_proposed ->> 'guest_post_cost') is not null
    or (p_proposed ->> 'guest_post_cost_written_by_publisher') is not null
    or (p_proposed ->> 'link_insertion_cost') is not null
    or (p_proposed ->> 'homepage_link_cost') is not null
    or (p_proposed ->> 'banner_cost') is not null
    /* The sensitive niches carry their own prices, and a reply that quoted
       only a gambling rate has quoted a real price. `hasAnyPrice` counts
       these, so this does too. */
    or exists (
      select 1
      from jsonb_each(coalesce(p_proposed -> 'niches', '{}'::jsonb)) as n(slug, terms)
      where (n.terms ->> 'guest_post_cost') is not null
         or (n.terms ->> 'link_insertion_cost') is not null
    );
$$;

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

revoke all on function public.draft_has_any_price(jsonb) from public;
revoke all on function public.draft_has_any_price(jsonb) from anon;
revoke all on function public.draft_has_any_price(jsonb) from authenticated;
