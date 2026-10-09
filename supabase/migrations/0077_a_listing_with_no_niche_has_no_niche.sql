-- ---------------------------------------------------------------------------
-- 0077  A listing with no category is not a technology site
--
-- `marketplace_listings` read `coalesce(pc.slug, 'technology') as niche`, so
-- every active listing with no primary category was presented to buyers as
-- Technology. Measured against the live marketplace: **1,840 of 12,190 active
-- listings**, one in seven, and not one of them carries a secondary category
-- either. They are not technology sites. Nobody said they were.
--
-- Two lines above it, the same view refuses to do exactly this with country:
--
--     case when w.country_source = 'default' then null else w.country_code end
--
-- The rule was already written down. The niche column did not follow it.
--
-- ## It also made one number contradict another
--
-- `marketplace_niche_counts` (the homepage's niche cards) inner joins
-- `primary_category_id`, so an unclassified listing counts under nothing.
-- `marketplace_facets` (the marketplace's own pills) counts over this view,
-- so the same listing counted as Technology. Replayed into a local database
-- and measured, adding one unclassified listing moved the marketplace's
-- Technology count from 1832 to 1833 and left the homepage's at 3.
--
-- Neither function changes here. Removing the default is what makes them
-- agree, because they then both mean "has a primary category".
--
-- ## What an unclassified listing loses, and what it keeps
--
-- It loses niche browsing: no niche filter returns it, no niche page lists
-- it, no count includes it. That is the honest answer, and the same rule the
-- country filter already applies - a listing with no stated market is
-- excluded by a country filter rather than included in every one.
--
-- It keeps everything else. It is still in the marketplace unfiltered, still
-- found by search, still filtered by domain rating, traffic, referring
-- domains, price, turnaround, link type, language, country and audience. The
-- 1,840 do not leave the inventory; they stop claiming to be something.
--
-- ## The place a null would have removed them from the marketplace
--
-- The search haystack in `marketplace_search` is a `||` chain, and anything
-- concatenated with null is null - so `position(part in null)` is null,
-- `bool_and` is null, the predicate fails, and every unclassified listing
-- vanishes from every text search while every filter still returns it.
-- Silent, and the kind of thing nobody reports: the listing is simply never
-- in the results. `verify:search` has a case for it, and removing the
-- coalesce makes that case fail with `js [07] vs sql []`.
--
-- The relevance score beside it also reads the niche, and I expected the
-- same trap there - five `case` expressions added up, one null nulling the
-- sum. It does not: `case when <null condition> then x else 0 end` takes the
-- else branch, so the score is already 0 and the sum is intact. Removing
-- that coalesce breaks no test, because it breaks nothing. It is kept as
-- defence against a later rewrite into a plain sum, and said here so the
-- next person does not go looking for the bug it does not prevent.
--
-- The empty string cannot match a search term, which is what "this listing
-- has no niche to match on" should mean.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

/*
  The view. `pc.slug`, not a default.

  Same column, same position, same type, so `create or replace` accepts it -
  only the value changes, from an invented 'technology' to null.

  The lateral below drops the coalesce too: with no primary category there is
  nothing for a secondary to duplicate, so every category a listing holds is
  a secondary one. `is distinct from` already treats null correctly.
*/
create or replace view public.marketplace_listings
with (security_invoker = true) as
select
  w.id,
  w.slug,
  w.domain,
  coalesce(nullif(btrim(w.title), ''), w.domain) as title,
  coalesce(w.description, '') as description,
  pc.slug as niche,
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
  coalesce(w.audience_split, '[]'::jsonb) as audience_split
from public.websites w
left join public.categories pc on pc.id = w.primary_category_id
left join lateral (
  select array_agg(distinct c.slug) as slugs
  from public.website_categories wc
  join public.categories c on c.id = wc.category_id
  where wc.website_id = w.id
    and c.slug is distinct from pc.slug
) sec on true;

comment on view public.marketplace_listings is
  'The marketplace as the app sees it, not as the columns store it: country hidden when its source is "default", niche null when nobody has set one, title falling back to the domain. security_invoker, so the websites policy decides what it returns.';

/*
  The sidebar counts, with no row for the listings that have no niche.

  `group by` on a nullable column produces a null group, and that row would
  have travelled to the browser as a facet with no value - counted, keyed by
  nothing, and rendered as a nameless filter. The listings are excluded from
  the niche counts because they are excluded from the niche filters; a count
  that offers more than the filter can deliver is the bug 0065 was written
  to fix.
*/
create or replace function public.marketplace_facets(p_topic text default null)
returns table (kind text, value text, count bigint)
language sql
stable
set search_path = public
as $$
  with topic as (
    select nullif(nullif(btrim(coalesce(p_topic, '')), ''), 'general') as slug
  ),
  -- Only publishers who take the topic at all, matching `forTopic`.
  offered as (
    select m.*
    from public.marketplace_listings m
    cross join topic t
    where m.status = 'active'
      and (t.slug is null or m.accepted_niches @> array[t.slug])
  )
  -- The niche and language counts are taken over every active listing rather
  -- than over the topic, which is what the page did: `nicheCounts` and
  -- `availableLanguages` read the whole list, `countryCounts` read the topic's.
  select 'niche'::text, m.niche, count(*)
  from public.marketplace_listings m
  where m.status = 'active'
    and m.niche is not null
  group by m.niche
  union all
  select 'language'::text, m.language, count(*)
  from public.marketplace_listings m
  where m.status = 'active'
  group by m.language
  union all
  select 'country'::text, o.country, count(*)
  from offered o
  where o.country is not null
  group by o.country
  union all
  -- Listings with no stated market at all, which the sidebar shows as its own
  -- line rather than hiding.
  select 'country-unstated'::text, ''::text, count(*)
  from offered o
  where o.country is null;
$$;

comment on function public.marketplace_facets(text) is
  'Niche, language and country counts for the marketplace sidebar. Niche and language over every active listing, country over the topic being bought for. A listing with no primary category is in no niche count, because no niche filter returns it.';

/*
  The niche pages' sample, asking for a real category rather than a defaulted
  one. Unchanged apart from that line; see 0073 for why it walks the order in
  strides instead of taking the strongest few.
*/
create or replace function public.marketplace_niche_preview(
  p_niche text,
  p_limit integer default 6
)
returns table (id uuid, total bigint, countries bigint)
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
      and (
        pc.slug = p_niche
        or exists (
          select 1
          from public.website_categories wc
          join public.categories c on c.id = wc.category_id
          where wc.website_id = w.id
            and c.slug = p_niche
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
    select m.id, row_number() over (order by m.domain_rating desc, m.id asc) - 1 as position
    from matched m
  )
  select ordered.id, counted.total, counted.countries
  from ordered
  cross join counted
  where ordered.position % greatest(1, counted.total / greatest(coalesce(p_limit, 6), 1)) = 0
  order by ordered.position
  limit greatest(1, least(coalesce(p_limit, 6), 24));
$$;

comment on function public.marketplace_niche_preview(text, integer) is
  'A spread of a niche''s listings plus its totals, in one query. A listing with no primary category belongs to no niche and appears in none of them.';

/*
  The search, with the two places a null niche would have removed a listing
  from the marketplace altogether.

  Same signature as 0076, so this replaces it in place - no drop, no
  overload. Three lines differ and they are marked below.
*/
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
          -- Defensive, not load-bearing: `case when` on a null condition
          -- already takes the else branch. See the note at the top.
          + (case when position(lower(btrim(p_search)) in coalesce(m.niche, '')) > 0 then 20 else 0 end)
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
              coalesce(m.niche, '') || ' ' || array_to_string(m.secondary_niches, ' ')
            )) > 0
          )
          from unnest(
            string_to_array(regexp_replace(lower(btrim(p_search)), '\s+', ' ', 'g'), ' ')
          ) as part
          where part <> ''
        )
      )
      -- A listing nobody has categorised is excluded by a niche filter, not
      -- included in every one - the rule the country filter below already
      -- follows. `m.niche = any(...)` on a null yields null rather than
      -- false, which excludes it correctly; it is spelled out because a
      -- predicate that works by three-valued logic is one somebody will
      -- later "simplify" into one that does not.
      and (p_niches is null or cardinality(p_niches) = 0
           or (m.niche is not null and m.niche = any (p_niches))
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
  'One page of the marketplace. Prices each candidate listing through the index on services(website_id) rather than pricing the whole marketplace first, and can narrow by where a publisher''s readers are as well as where the publisher is. A listing with no primary category matches no niche filter and still matches everything else.';
