-- ---------------------------------------------------------------------------
-- 0064  Search the marketplace in the database
--
-- The marketplace filters client-side over the whole dataset. `getAll()` reads
-- every active listing, ships it to the browser, and `runQuery` filters there.
-- That was written against a few hundred listings. There are 3,405 live now and
-- 7,174 approved, priced and waiting to be published, and at that size the page
-- carries roughly three times what it carries today - on every visit, for every
-- customer, on the page they open to check out.
--
-- `website-repository.ts` has said so since it was written: "fine into the low
-- thousands and wrong beyond it. When the inventory outgrows this, `search()`
-- below is the replacement: it already pushes filtering into the database."
--
-- This is that replacement. The function returns the ids for one page and the
-- total; the caller reads those few rows through the mapper it already has, so
-- nothing here duplicates the row-to-object mapping.
--
-- ## Why a view, and why security_invoker
--
-- The view exists because four of the fields the marketplace filters on are not
-- columns. They are computed in `mapWebsite` and `toListItem`, and a filter that
-- read the raw columns instead would quietly disagree with what the page shows:
--
--   * `country` is NULL when `country_source = 'default'`. That value is the
--     United Kingdom every listing claimed before the column could be null -
--     "evidence of nothing", as 0044 puts it - and the app hides it. SQL
--     filtering on `country_code` would match listings the page says have no
--     stated market.
--   * `niche` falls back to 'technology' when no primary category is set.
--   * `title` falls back to the domain when blank, and the search text includes
--     the title.
--   * the headline price is the first available placement by type priority,
--     repriced for the topic being bought for.
--
-- `security_invoker = true` means the view runs as whoever selects from it, so
-- the existing policy on `websites` - signed-in users read active listings -
-- decides what it returns. No new privilege path is created: anon sees nothing
-- here because anon sees nothing there, and this migration grants nobody
-- anything they did not already have. The search function is likewise plain
-- (not security definer) for the same reason.
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
  w.status
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

-- ---------------------------------------------------------------------------
-- One page of the marketplace.
--
-- Returns ids and the total rather than rows: the caller already has a mapper
-- for the row shape, and duplicating it here is how the page and the filter
-- come to disagree about what a listing is.
--
-- `p_topic` narrows to publishers who accept that topic and reprices their
-- placements to what they charge for it, which is what `forTopic` does in JS -
-- so the price filtered on, sorted by and printed on the card is one number.
-- 'general' is everybody and reprices nothing, because no publisher has ever
-- had to record that they accept ordinary content.
--
-- Every text comparison uses `position(... in ...)` rather than LIKE. A search
-- term is customer input, and in a LIKE pattern `%` and `_` are wildcards -
-- "100%" would match differently than it reads, and a term of all wildcards
-- would match the inventory.
-- ---------------------------------------------------------------------------

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
  -- Every placement, priced for the topic being bought for.
  placement as (
    select
      s.website_id,
      s.type,
      s.available,
      s.turnaround_min_days,
      s.turnaround_max_days,
      coalesce(np.price_minor, s.price_minor) as price_minor,
      case s.type when 'guest-post' then 0 when 'niche-edit' then 1 else 2 end as priority
    from public.services s
    cross join topic t
    left join public.website_niche_prices np
      on np.website_id = s.website_id
     and np.link_type = s.type
     and np.niche = t.slug
  ),
  -- `toListItem`: available placements if any, otherwise all of them.
  pool as (
    select p.*, bool_or(p.available) over (partition by p.website_id) as any_available
    from placement p
  ),
  chosen as (
    select * from pool where available or not any_available
  ),
  headline as (
    select distinct on (website_id)
      website_id, price_minor as headline_price, turnaround_min_days as headline_turnaround
    from chosen
    order by website_id, priority
  ),
  totals as (
    select
      website_id,
      min(price_minor) as lowest_price,
      min(turnaround_max_days) filter (where available) as fastest_max_turnaround
    from chosen
    group by website_id
  ),
  matched as (
    select
      m.id,
      h.headline_price,
      h.headline_turnaround,
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
    join headline h on h.website_id = m.id
    join totals tt on tt.website_id = m.id
    cross join topic t
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
      and (p_link_types is null or cardinality(p_link_types) = 0
           or exists (select 1 from chosen c
                       where c.website_id = m.id and c.available
                         and c.type::text = any (p_link_types)))
      -- A listing matches if any offered placement falls inside the window,
      -- counting only the link types asked for when some were.
      and ((p_price_min is null and p_price_max is null)
           or exists (select 1 from chosen c
                       where c.website_id = m.id and c.available
                         and (p_link_types is null or cardinality(p_link_types) = 0
                              or c.type::text = any (p_link_types))
                         and (p_price_min is null or c.price_minor >= p_price_min)
                         and (p_price_max is null or c.price_minor <= p_price_max)))
      and (p_max_turnaround is null
           or (tt.fastest_max_turnaround is not null
               and tt.fastest_max_turnaround <= p_max_turnaround))
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

comment on function public.marketplace_search is
  'One page of the marketplace, filtered and sorted in the database. Returns ids and the total; the caller maps the rows. Not security definer - row level security on websites decides what it can see, exactly as the full read it replaces did.';
