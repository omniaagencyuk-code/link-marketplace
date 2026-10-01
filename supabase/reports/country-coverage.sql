-- ---------------------------------------------------------------------------
-- Which markets the marketplace actually knows
--
-- Run this after 0043. It answers the question 0043 deliberately left open:
-- how many listings still say 'GB' with nothing behind it.
--
-- Paste the whole thing and run it. The Supabase editor shows only the last
-- result set, so the numbers you need are at the bottom.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Where every 'GB' listing stands.
--
--   confirmed by its domain     - a .uk suffix. Genuinely British.
--   contradicted by measurement - the traffic says somewhere else. 0043 should
--                                 have moved these; any left are a bug.
--   nothing behind it           - a generic suffix, no measured traffic. This
--                                 is the ambiguous set: an invented 'GB' and a
--                                 real British .com look identical.
-- ---------------------------------------------------------------------------
with gb as (
  select
    id,
    domain,
    lower(regexp_replace(domain, '^.*\.', '')) as suffix,
    case
      when jsonb_typeof(audience_split) = 'array' and jsonb_array_length(audience_split) > 0
        then (
          select upper(entry->>'country')
          from jsonb_array_elements(audience_split) as entry
          order by coalesce((entry->>'share')::numeric, 0) desc
          limit 1
        )
    end as measured
  from public.websites
  where country_code = 'GB'
)
select
  case
    when suffix = 'uk' then 'confirmed by its domain'
    when measured is not null and measured <> 'GB' then 'contradicted by measurement'
    when measured = 'GB' then 'confirmed by measurement'
    else 'nothing behind it'
  end as standing,
  count(*) as listings
from gb
group by 1
order by listings desc;

-- ---------------------------------------------------------------------------
-- How much country data exists at all, by where it came from.
-- ---------------------------------------------------------------------------
select
  count(*) as listings,
  count(country_code) as with_a_market,
  count(*) - count(country_code) as market_unknown,
  count(*) filter (
    where jsonb_typeof(audience_split) = 'array' and jsonb_array_length(audience_split) > 0
  ) as with_measured_traffic,
  count(*) filter (where country_code = 'GB') as still_gb
from public.websites;

-- ---------------------------------------------------------------------------
-- The distribution a buyer sees. This is the list the country filter offers,
-- and the reason it offered thirteen countries with nothing in twelve of them.
-- ---------------------------------------------------------------------------
select
  coalesce(country_code, '(not stated)') as market,
  count(*) as listings,
  count(*) filter (where status = 'active') as live
from public.websites
group by 1
order by listings desc, market;
