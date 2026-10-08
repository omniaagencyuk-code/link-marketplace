-- ---------------------------------------------------------------------------
-- 0072  One page of the marketplace without reading all of it
--
-- `/marketplace` timed out. Measured on a copy of the real inventory - 12,629
-- active listings, 24,020 placements - the first page took 11.7 seconds, and
-- the plan says exactly where it went:
--
--     Nested Loop  (actual time=108..12681 rows=10811)
--       Join Filter: (chosen.website_id = w.id)
--       Rows Removed by Join Filter: 129915787
--
-- A hundred and thirty million row comparisons, 12.68 of the 12.7 seconds.
--
-- 0064 priced every placement in the marketplace in CTEs - `placement`,
-- `pool`, `chosen`, `headline`, `totals` - and then joined those to the
-- listings. A CTE has no index and no statistics, so the planner estimated
-- the matched set at 2 rows when it was 10,811, chose a nested loop, and
-- rescanned all 24,020 placement rows once per website.
--
-- That was survivable at 3,405 active listings. The cost is websites times
-- placements, so publishing the draft backlog tripled one and the product
-- with it.
--
-- The arithmetic is unchanged. What changes is where it runs: per listing,
-- through `services_website_idx`, instead of for the whole marketplace before
-- anything is filtered. `verify:search` is what says the answers are the same
-- - the same 39 differential checks against the browser-side engine that
-- 0064 shipped with.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

/*
  One listing's placements, priced for the topic being bought for.

  A function rather than a lateral written inline, because the search calls it
  once per candidate row and the body is long enough that having two copies
  drift apart is the likelier bug.

  `stable` and `parallel safe` so the planner may call it freely; it only
  reads. The `services` lookup is an index hit on `website_id`, which is the
  whole point - the version this replaces scanned every placement in the
  marketplace for every listing it considered.
*/
create or replace function public.marketplace_placements(
  p_website_id uuid,
  p_topic_slug text,
  p_link_types text[] default null,
  p_price_min integer default null,
  p_price_max integer default null
)
returns table (
  headline_price integer,
  headline_turnaround integer,
  fastest_max_turnaround integer,
  has_link_type boolean,
  price_in_window boolean
)
language sql
stable
parallel safe
set search_path = public
as $$
  with mine as (
    select
      s.type,
      s.available,
      s.turnaround_min_days,
      s.turnaround_max_days,
      coalesce(np.price_minor, s.price_minor) as price_minor,
      case s.type when 'guest-post' then 0 when 'niche-edit' then 1 else 2 end as priority
    from public.services s
    left join public.website_niche_prices np
      on np.website_id = s.website_id
     and np.link_type = s.type
     and np.niche = p_topic_slug
    where s.website_id = p_website_id
  ),
  -- `toListItem`: the available placements if there are any, otherwise all of
  -- them. Unchanged from 0064, computed over one listing instead of all.
  chosen as (
    select * from mine
    where available or not exists (select 1 from mine m2 where m2.available)
  )
  select
    (select c.price_minor from chosen c order by c.priority limit 1),
    (select c.turnaround_min_days from chosen c order by c.priority limit 1),
    (select min(c.turnaround_max_days) from chosen c where c.available),
    (select count(*) > 0 from chosen c
      where c.available
        and (p_link_types is null or cardinality(p_link_types) = 0
             or c.type::text = any (p_link_types))),
    (select count(*) > 0 from chosen c
      where c.available
        and (p_link_types is null or cardinality(p_link_types) = 0
             or c.type::text = any (p_link_types))
        and (p_price_min is null or c.price_minor >= p_price_min)
        and (p_price_max is null or c.price_minor <= p_price_max));
$$;

comment on function public.marketplace_placements(uuid, text, text[], integer, integer) is
  'One listing''s placements, priced for a topic. Called once per candidate row by marketplace_search, through the index on services(website_id).';

revoke all on function public.marketplace_placements(uuid, text, text[], integer, integer) from public;
grant execute on function public.marketplace_placements(uuid, text, text[], integer, integer) to anon, authenticated, service_role;

create or replace function public.marketplace_search(
  p_search text default null,
  p_niches text[] default null,
  p_countries text[] default null,
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

comment on function public.marketplace_search(text, text[], text[], text[], text[], text, integer, integer, integer, integer, integer, integer, integer, integer, integer, boolean, text, text, integer, integer) is
  'One page of the marketplace. Prices each candidate listing through the index on services(website_id) rather than pricing the whole marketplace first.';
