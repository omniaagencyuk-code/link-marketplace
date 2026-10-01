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
-- You probably do not need this. 0044 marks those rows `country_source =
-- 'default'`, and the application does not surface a `default` country: it is
-- not shown, not filtered on, and the first real evidence - a measured audience,
-- or an administrator choosing one - replaces it. So the invented United Kingdom
-- is already invisible, and the value is still there if it turns out to have
-- been right.
--
-- Run this only to delete it outright. Run
-- `supabase/reports/country-coverage.sql` first and look at the
-- "nothing behind it" count: that is exactly how many rows this changes.
--
-- What it buys you: a `select country_code from websites` in the SQL editor
-- stops reading as though the marketplace were British. What it costs you: if
-- any of those listings genuinely was British, that is gone and nobody can tell
-- you which it was.
-- ---------------------------------------------------------------------------

update public.websites
set country_code = null,
    -- Both, or the check constraint added by 0044 rejects the row: a country
    -- and its source are null together or not at all.
    country_source = null
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
