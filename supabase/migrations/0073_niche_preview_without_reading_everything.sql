-- ---------------------------------------------------------------------------
-- 0073  A niche page's preview, without reading the marketplace
--
-- The same mistake 0072 fixed, on the pages that are public.
--
-- `getPublicPreview(6, niche)` paged through EVERY active listing - with its
-- services, niche prices, categories and topics joined on - and then filtered
-- by niche in JavaScript, to show six rows and a count. At 12,629 active
-- listings that is twenty-six sequential round trips, each carrying five
-- embedded tables, to render six cards.
--
-- It was written when a niche held a few hundred listings and the comment
-- above it says why the filtering was in JavaScript: a listing's niche lives
-- in a join table. That is true and it is not a reason - a join table is
-- something SQL is good at.
--
-- `/gambling-link-building` and every CMS niche page call this, including
-- `/cbd-backlinks`. They are public and indexed, so this is the one that
-- Google sees time out.
--
-- ## The sample has to stay a spread
--
-- `getPublicPreview` walks the ordered listings in strides rather than taking
-- the strongest six, "so the preview represents the marketplace instead of
-- advertising its top end". That is a deliberate choice about honesty in
-- marketing and it is kept exactly: `row_number()` over the same order, every
-- stride-th row.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_niche_preview(
  p_niche text,
  p_limit integer default 6
)
returns table (
  id uuid,
  total bigint,
  countries bigint
)
language sql
stable
set search_path = public
as $$
  with matched as (
    select
      w.id,
      w.domain_rating,
      case when w.country_source = 'default' then null else w.country_code end as country
    from public.websites w
    left join public.categories pc on pc.id = w.primary_category_id
    where w.status = 'active'
      /*
        `inNiche`: the primary category or any secondary one. The primary
        falls back to 'technology' when a listing has none, which is what
        `marketplace_listings` does and what the mapper has always done - a
        listing with no category is a technology listing everywhere else, so
        it is one here.
      */
      and (
        coalesce(pc.slug, 'technology') = p_niche
        or exists (
          select 1
          from public.website_categories wc
          join public.categories c on c.id = wc.category_id
          where wc.website_id = w.id and c.slug = p_niche
        )
      )
  ),
  counted as (
    select
      count(*) as total,
      count(distinct country) filter (where country is not null) as countries
    from matched
  ),
  ordered as (
    select
      m.id,
      -- The order the paged read arrived in, so the sample is the same one.
      row_number() over (order by m.domain_rating desc, m.id asc) - 1 as position
    from matched m
  )
  select
    ordered.id,
    counted.total,
    counted.countries
  from ordered
  cross join counted
  /*
    Every stride-th row, the stride being what the JavaScript computed:
    `max(1, floor(total / max(limit, 1)))`. Integer division in SQL truncates
    the same way, and `greatest` is `Math.max`.
  */
  where ordered.position % greatest(1, counted.total / greatest(coalesce(p_limit, 6), 1)) = 0
  order by ordered.position
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.marketplace_niche_preview(text, integer) is
  'A niche landing page''s sample and counts. Replaces paging through every active listing with five embedded tables to show six rows.';

revoke all on function public.marketplace_niche_preview(text, integer) from public;
grant execute on function public.marketplace_niche_preview(text, integer) to anon, authenticated, service_role;
