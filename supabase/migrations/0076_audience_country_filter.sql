-- ---------------------------------------------------------------------------
-- 0076  Filter the marketplace by where a publisher's readers are
--
-- The marketplace could already be filtered by a publisher's country. That is
-- where the publisher is, which is not the question most buyers are asking:
-- a UK business wants a site read in the UK, and a DR 80 site read entirely
-- in Indonesia is no use to them whatever its flag says.
--
-- The data to answer that has been there all along. `audience_split` is
-- written by the Ahrefs refresh from visits per country, and the marketplace
-- started showing it in each row this week. This makes it something you can
-- narrow by: at least 30% of organic traffic from the United Kingdom, or at
-- least 5,000 visits a month from it.
--
-- ## Why this is not the existing country filter with extra settings
--
-- Overloading `p_countries` was the obvious move and it is wrong. That filter
-- means "the publisher is in one of these countries" and the new one means
-- "this much of the audience is in this country". They are different
-- questions with different answers - a US publication can be read mostly in
-- the UK - and folding the second into the first would silently change what
-- the first one has always meant for anybody who had it set.
--
-- So it is its own control: one country, and up to two thresholds on it.
--
-- ## Unmeasured is excluded, not included
--
-- The same rule the country filter already follows. 6,422 of the 12,190
-- active listings carry two countries or more and the rest carry fewer or
-- none; a listing nobody has measured does not satisfy "at least 30% from
-- the UK", because we do not know that it does. Including it would answer a
-- question about our data as though it were a question about the publisher.
--
-- ## The share is the stored one
--
-- `share` is recorded by the refresh, derived there from the visit counts, so
-- the figure filtered on is the figure drawn in the row. Recomputing it here
-- from `traffic` over `organic_traffic` would be a second definition of the
-- same number, free to disagree with the first.
--
-- The view gains `audience_split` for this; it is already readable by anyone
-- who can read the row, so nothing is exposed that was not.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace view public.marketplace_listings
with (security_invoker = true) as
select
  w.id,
  w.slug,
  w.domain,
  coalesce(nullif(btrim(w.title), ''), w.domain) as title,
  coalesce(w.description, '') as description,
  coalesce(pc.slug, 'technology') as niche,
  coalesce(sec.slugs, '{}'::text[]) as secondary_niches,
  case when w.country_source = 'default' then null else w.country_code end as country,
  coalesce(w.language_code, 'en') as language,
  w.domain_rating,
  w.organic_traffic,
  w.referring_domains,
  w.organic_keywords,
  w.verified,
  w.completed_orders,
  w.created_at,
  w.link_attribute,
  coalesce(w.accepted_niches, '{}'::text[]) as accepted_niches,
  w.status,
  /*
    Where the readers are, as the refresh measured it.

    Last in the list, and it has to be: `create or replace view` can only
    append columns. Putting it beside the other metrics - which is where it
    belongs - makes Postgres read the change as renaming `status`, and it
    refuses. So the order here is the order it was added in, not the order
    it would be written in from scratch.
  */
  coalesce(w.audience_split, '[]'::jsonb) as audience_split
from public.websites w
left join public.categories pc on pc.id = w.primary_category_id
left join lateral (
  select array_agg(distinct c.slug) as slugs
  from public.website_categories wc
  join public.categories c on c.id = wc.category_id
  where wc.website_id = w.id
    and c.slug is distinct from coalesce(pc.slug, 'technology')
) sec on true;

comment on view public.marketplace_listings is
  'The marketplace as the app sees it, not as the columns store it: country hidden when its source is "default", niche defaulted to technology, title falling back to the domain. security_invoker, so the websites policy decides what it returns.';

-- The signature gains three arguments, so the old one is dropped rather than
-- left beside it: two overloads differing only by defaults make every named
-- call ambiguous, which is how 0068 broke `admin_website_ids`.
drop function if exists public.marketplace_search(
  text, text[], text[], text[], text[], text, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, boolean, text, text,
  integer, integer
);

create or replace function public.marketplace_search(
  p_search text default null,
  p_niches text[] default null,
  p_countries text[] default null,
  /*
    Where the readers are, rather than where the publisher is. One country
    and up to two thresholds on it; see the note at the top for why this is
    not `p_countries` with extra settings.
  */
  p_audience_country text default null,
  p_audience_share_min integer default null,
  p_audience_traffic_min integer default null,
  p_languages text[] default null,
  p_link_types text[] default null,
  p_link_attribute text default null,
  p_dr_min integer default null,
  p_dr_max integer default null,
  p_traffic_min integer default null,
  p_traffic_max integer default null,
  p_rd_min integer default null,
  p_rd_max integer default null,
  p_price_min integer default null,
  p_price_max integer default null,
  p_max_turnaround integer default null,
  p_verified boolean default false,
  p_topic text default null,
  p_sort text default 'relevance',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
set search_path = public
as $$
  with topic as (
    select nullif(nullif(btrim(coalesce(p_topic, '')), ''), 'general') as slug
  ),
  matched as (
    select
      m.id,
      pl.headline_price,
      pl.headline_turnaround,
      m.domain_rating,
      m.organic_traffic,
      m.referring_domains,
      m.organic_keywords,
      m.created_at,
      case
        when coalesce(btrim(p_search), '') = '' then 0
        else
          (case when position(lower(btrim(p_search)) in lower(m.domain)) = 1 then 100 else 0 end)
          + (case when position(lower(btrim(p_search)) in lower(m.domain)) > 0 then 60 else 0 end)
          + (case when position(lower(btrim(p_search)) in lower(m.title)) > 0 then 30 else 0 end)
          + (case when position(lower(btrim(p_search)) in m.niche) > 0 then 20 else 0 end)
          + (case when position(lower(btrim(p_search)) in lower(m.description)) > 0 then 10 else 0 end)
      end as relevance,
      m.domain_rating * 1000 + m.completed_orders as quality
    from public.marketplace_listings m
    cross join topic t
    cross join lateral public.marketplace_placements(m.id, t.slug, p_link_types, p_price_min, p_price_max) pl
    where m.status = 'active'
      -- Every word of the search has to appear somewhere in the listing.
      and (
        coalesce(btrim(p_search), '') = ''
        or (
          select bool_and(
            position(part in lower(
              m.domain || ' ' || m.title || ' ' || m.description || ' ' ||
              m.niche || ' ' || array_to_string(m.secondary_niches, ' ')
            )) > 0
          )
          from unnest(
            string_to_array(regexp_replace(lower(btrim(p_search)), '\s+', ' ', 'g'), ' ')
          ) as part
          where part <> ''
        )
      )
      and (p_niches is null or cardinality(p_niches) = 0
           or m.niche = any (p_niches)
           or m.secondary_niches && p_niches)
      -- A listing with no stated market is excluded by a country filter, not
      -- included in every one.
      and (p_countries is null or cardinality(p_countries) = 0
           or (m.country is not null and m.country = any (p_countries)))
      and (p_languages is null or cardinality(p_languages) = 0
           or m.language = any (p_languages))
      /*
        At least this much of the audience in this country.

        A listing with no measured split cannot satisfy it: `exists` over an
        empty array is false, which is the answer we want and is why this is
        not written as a `not exists`. Either threshold may be left out, and
        with no country named the whole clause is skipped.
      */
      and (
        coalesce(btrim(p_audience_country), '') = ''
        or exists (
          select 1
          from jsonb_array_elements(m.audience_split) as slice
          where upper(slice ->> 'country') = upper(btrim(p_audience_country))
            and (p_audience_share_min is null
                 or coalesce((slice ->> 'share')::numeric, 0) >= p_audience_share_min)
            and (p_audience_traffic_min is null
                 or coalesce((slice ->> 'traffic')::numeric, 0) >= p_audience_traffic_min)
        )
      )
      and (p_link_attribute is null or m.link_attribute::text = p_link_attribute)
      and (p_dr_min is null or m.domain_rating >= p_dr_min)
      and (p_dr_max is null or m.domain_rating <= p_dr_max)
      and (p_traffic_min is null or m.organic_traffic >= p_traffic_min)
      and (p_traffic_max is null or m.organic_traffic <= p_traffic_max)
      and (p_rd_min is null or m.referring_domains >= p_rd_min)
      and (p_rd_max is null or m.referring_domains <= p_rd_max)
      and (not coalesce(p_verified, false) or m.verified)
      -- Only publishers who take this topic at all.
      and (t.slug is null or m.accepted_niches @> array[t.slug])
      and (p_link_types is null or cardinality(p_link_types) = 0 or pl.has_link_type)
      -- A listing matches if any offered placement falls inside the window,
      -- counting only the link types asked for when some were.
      and ((p_price_min is null and p_price_max is null) or pl.price_in_window)
      and (p_max_turnaround is null
           or (pl.fastest_max_turnaround is not null
               and pl.fastest_max_turnaround <= p_max_turnaround))
  )
  select matched.id, count(*) over () as total
  from matched
  order by
    -- Unmeasured keywords sort last either way: treating them as zero would
    -- rank our own coverage rather than the inventory.
    case when p_sort = 'kw-asc' then matched.organic_keywords end asc nulls last,
    case when p_sort = 'kw-desc' then matched.organic_keywords end desc nulls last,
    case when p_sort = 'price-asc' then matched.headline_price end asc,
    case when p_sort = 'price-desc' then matched.headline_price end desc,
    case when p_sort = 'dr-asc' then matched.domain_rating end asc,
    case when p_sort = 'dr-desc' then matched.domain_rating end desc,
    case when p_sort = 'traffic-asc' then matched.organic_traffic end asc,
    case when p_sort = 'traffic-desc' then matched.organic_traffic end desc,
    case when p_sort = 'rd-asc' then matched.referring_domains end asc,
    case when p_sort = 'rd-desc' then matched.referring_domains end desc,
    case when p_sort = 'turnaround-asc' then matched.headline_turnaround end asc,
    case when p_sort = 'turnaround-desc' then matched.headline_turnaround end desc,
    case when p_sort = 'newest' then matched.created_at end desc,
    case when p_sort = 'relevance' or p_sort is null then matched.relevance end desc,
    case when p_sort = 'relevance' or p_sort is null then matched.quality end desc,
    -- The tiebreak is the order the full read used to arrive in, because the
    -- JavaScript sort it replaces was stable over exactly that order. Without
    -- it two listings tied on price would come back in whichever order the
    -- plan happened to produce, and page two could repeat a row from page one.
    matched.domain_rating desc,
    matched.id asc
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));



$$;

comment on function public.marketplace_search(
  text, text[], text[], text, integer, integer, text[], text[], text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  boolean, text, text, integer, integer
) is
  'One page of the marketplace. Prices each candidate listing through the index on services(website_id) rather than pricing the whole marketplace first, and can narrow by where a publisher''s readers are as well as where the publisher is.';
