-- ---------------------------------------------------------------------------
-- Clear the United Kingdom nobody claimed
--
-- READ THIS FIRST. It is not a migration and it is not idempotent in any
-- meaningful sense: it overwrites data, and there is no undo.
--
-- 0043 backfilled every market it could establish - from a measured traffic
-- breakdown, or from the domain's own suffix. What is left saying 'GB' is the
-- set where neither applies: a generic suffix, no measured traffic. An
-- invented 'GB' and a genuinely British .com are indistinguishable there, so
-- 0043 left them alone rather than guessing a second time.
--
-- Run this only if the country was invented - which it was if your import had
-- no country, location, geo or market column. Run
-- `supabase/reports/country-coverage.sql` first and look at the
-- "nothing behind it" count: that is exactly how many rows this changes.
--
-- Why clearing beats leaving: a listing that says "United Kingdom" when nobody
-- said so puts a publisher in front of a buyer who asked for British traffic,
-- and the buyer finds out after they have paid. The marketplace already treats
-- an unknown market as unknown - it shows a dash, and a country filter hides
-- it rather than matching it.
-- ---------------------------------------------------------------------------

update public.websites
set country_code = null
where country_code = 'GB'
  -- Not a .uk. Those are confirmed by the domain itself.
  and lower(regexp_replace(domain, '^.*\.', '')) <> 'uk'
  -- And nothing measured. A measured market would have been backfilled by
  -- 0043, so this is belt and braces: it cannot clear a row that has evidence.
  and not (
    jsonb_typeof(audience_split) = 'array'
    and jsonb_array_length(audience_split) > 0
  );

select
  coalesce(country_code, '(not stated)') as market,
  count(*) as listings
from public.websites
group by 1
order by listings desc, market;
