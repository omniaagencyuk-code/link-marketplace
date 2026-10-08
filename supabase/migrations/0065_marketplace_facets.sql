-- ---------------------------------------------------------------------------
-- 0065  The filter counts, without reading the inventory
--
-- The sidebar counts what it can offer: how many listings are in each niche,
-- which countries actually have any and how many, which languages are
-- represented. Those numbers came from the full read the marketplace no longer
-- does, and they are the one thing 0064 did not replace.
--
-- They matter more than they look. The sidebar used to offer all thirteen
-- curated countries whether or not a single listing was in one, so ticking
-- "United States" emptied the screen with no hint why. Counting from the
-- listings on offer means the filter can only promise what it can deliver.
--
-- Scoped by topic and by nothing else, which is what the page did: choosing a
-- topic changes the counts, because a country with four publishers, none of
-- whom take gambling, should not read "4" to somebody buying for a casino.
-- The other filters deliberately do not narrow these - a count that reacted to
-- the filter it belongs to would always read either everything or nothing.
--
-- One call returns all three, keyed by kind, because three round trips for
-- three aggregates over the same rows is two more than the page needs.
--
-- `security_invoker` like the view it reads, so the policy on `websites`
-- decides what gets counted and nobody gains access to anything.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

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
  'Niche, language and country counts for the marketplace sidebar. Niche and language over every active listing, country over the topic being bought for - which is what the page computed before filtering moved into the database.';
