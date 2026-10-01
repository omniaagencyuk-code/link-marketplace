-- ---------------------------------------------------------------------------
-- 0044  Where a country came from
--
-- 0043 gave the marketplace a country it could actually believe. This records
-- how it got there, which decides who is allowed to change it.
--
-- The Ahrefs refresh measures an audience by country for every domain it runs
-- against, every night. That is the best evidence of a publisher's primary
-- market there is short of being told, and it should replace a country worked
-- out from a domain suffix the moment it arrives. It must not replace one a
-- person chose - a nightly job silently undoing an administrator's edit is the
-- same class of bug as the invented 'GB': a value changing with nothing to say
-- why.
--
-- So the precedence is stated > measured > domain, and this column is what the
-- refresh reads before it writes.
--
--   stated   - a person, or a publisher's own list, said so.
--   measured - the largest share of the Ahrefs traffic breakdown.
--   domain   - the country the domain's own suffix names.
--   default  - the United Kingdom every listing used to claim. Evidence of
--              nothing: the application does not surface it, and the first real
--              evidence replaces it.
--
-- The values are `COUNTRY_SOURCES` in src/lib/types/country.ts, and
-- verify:marketplace fails if this constraint and that list disagree.
--
-- Depends on 0043: the backfill reads the countries 0043 established.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

alter table public.websites
  add column if not exists country_source text;

-- ---------------------------------------------------------------------------
-- The constraints come off first, and go back on at the end.
--
-- Off first because a check constraint rejects the backfill below: a re-run of
-- this migration after the allowed list has changed would be writing a value
-- the constraint still on the table refuses, and the migration would fail on
-- its second run rather than its first. Found exactly that way.
-- ---------------------------------------------------------------------------
alter table public.websites
  drop constraint if exists websites_country_source_check;

alter table public.websites
  drop constraint if exists websites_country_needs_a_source;

-- ---------------------------------------------------------------------------
-- Backfill, from the same evidence 0043 used and in the same order.
--
-- Before the constraints go back on: a check constraint is validated against
-- the existing rows the moment it is added, and every row 0043 left with a
-- country but no source would fail it.
-- ---------------------------------------------------------------------------

-- Measured: the stored country is the top country in the traffic breakdown.
update public.websites w
set country_source = 'measured'
where w.country_code is not null
  and w.country_source is null
  and jsonb_typeof(w.audience_split) = 'array'
  and jsonb_array_length(w.audience_split) > 0
  and w.country_code = (
    select upper(entry->>'country')
    from jsonb_array_elements(w.audience_split) as entry
    order by coalesce((entry->>'share')::numeric, 0) desc
    limit 1
  );

-- Domain: the stored country is the one the suffix names. Covers the .uk rows
-- that were right all along as well as the ones 0043 corrected. `uk` is spelt
-- out because the suffix and the ISO code differ for exactly one country.
update public.websites w
set country_source = 'domain'
where w.country_code is not null
  and w.country_source is null
  and (
    lower(regexp_replace(w.domain, '^.*\.', '')) = lower(w.country_code)
    or (w.country_code = 'GB' and lower(regexp_replace(w.domain, '^.*\.', '')) = 'uk')
  );

-- Default: the United Kingdom nobody claimed.
--
-- 0043 corrected every 'GB' it could account for. What is left is the signature
-- of the invented value exactly: 'GB', not a .uk domain, no measured traffic.
-- Marked rather than deleted - the value stays in the column, so nothing is
-- destroyed and the decision is reversible - but `mapWebsite` does not surface
-- a `default` country, so it is not shown, not filtered on, and replaced by the
-- first real evidence that arrives. Which makes
-- `supabase/reports/clear-unstated-country.sql` optional rather than necessary.
update public.websites
set country_source = 'default'
where country_code = 'GB'
  and country_source is null
  and lower(regexp_replace(domain, '^.*\.', '')) <> 'uk'
  and not (
    jsonb_typeof(audience_split) = 'array'
    and jsonb_array_length(audience_split) > 0
  );

-- Everything else with a country: somebody put it there. A country that is not
-- 'GB' could not have come from the old default, so the only thing that could
-- have written it is an import column or a person - and a human's answer is
-- what this column exists to protect.
update public.websites
set country_source = 'stated'
where country_code is not null
  and country_source is null;

-- A country that lost its source, or a source with no country, would both be
-- rows nobody can account for. Clear the stragglers before the constraint goes
-- on, so re-running this migration after a hand edit does not fail.
update public.websites
set country_source = null
where country_code is null
  and country_source is not null;

-- ---------------------------------------------------------------------------
-- And back on, now that every row satisfies them.
-- ---------------------------------------------------------------------------
alter table public.websites
  add constraint websites_country_source_check
  check (country_source is null or country_source in ('stated', 'measured', 'domain', 'default'));

-- A country with no source is a country nobody can account for, which is the
-- state this column exists to end.
alter table public.websites
  add constraint websites_country_needs_a_source
  check ((country_code is null) = (country_source is null));

-- ---------------------------------------------------------------------------
-- What this left behind. Last, because the SQL editor shows only the final
-- result set.
-- ---------------------------------------------------------------------------
select
  coalesce(country_source, '(no country)') as source,
  count(*) as listings
from public.websites
group by 1
order by listings desc, source;
