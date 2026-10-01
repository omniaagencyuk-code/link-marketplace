-- ---------------------------------------------------------------------------
-- 0043  A country the marketplace was never told
--
-- Every listing said United Kingdom. `country_code` is `char(2) not null` with
-- no default, so a country had to be supplied at insert - and the only thing
-- supplying one was `newWebsiteDefaults`, which hard-coded 'GB'. A publisher
-- list rarely carries a country column and an email never does, so almost
-- every listing claimed a market nobody had named, and filtering the
-- marketplace for the United States found nothing at all.
--
-- The fix is to let the column say "nobody has said", and then to fill it in
-- only from things that are actually known:
--
--   1. The traffic breakdown. `audience_split` is measured, by country, from
--      Ahrefs. Where it exists, the country with the largest share IS the
--      primary market - the listing page already prefers it for display over
--      the stored claim, for exactly this reason.
--
--   2. The domain's own suffix. `mgdk.dk` is Danish. Only suffixes that name a
--      country are read: `.io`, `.ai`, `.co`, `.me` and the rest sold as words
--      are left alone, because reading those would put the guess back. The
--      list is generated from `src/lib/data/cctld.ts` by
--      `scripts/cctld-sql.mts`, and `verify:marketplace` fails if the two
--      drift apart.
--
-- Both are applied only where the stored country is 'GB' - the invented value.
-- A country somebody actually stated is never overwritten, because there is no
-- way to tell a stated 'GB' from a defaulted one and the safe reading of an
-- ambiguous row is to leave it.
--
-- What this migration deliberately does NOT do: clear the 'GB' rows it cannot
-- explain - a `.com` with no measured traffic. Those are the genuinely
-- ambiguous ones, a real UK site and an invented UK claim look identical, and
-- nulling them is a judgement about the data rather than a schema change. Run
-- `supabase/reports/country-coverage.sql` to see how many there are, then
-- `supabase/reports/clear-unstated-country.sql` if they are invented.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

-- A country nobody has stated is now representable. This is the whole bug: the
-- schema had no way to record "unknown", so the code invented an answer.
alter table public.websites alter column country_code drop not null;

-- char(2) pads and compares with trailing spaces, which has bitten enough
-- schemas to be worth fixing while the column is being touched anyway.
alter table public.websites alter column country_code type text;

-- ---------------------------------------------------------------------------
-- 1. The measured market wins over the invented one.
--
-- `audience_split` is [{country, share, traffic}, ...] written by the Ahrefs
-- refresh. Ordering by share picks the primary market as measured rather than
-- as claimed.
-- ---------------------------------------------------------------------------
with measured as (
  select
    w.id,
    (
      select upper(entry->>'country')
      from jsonb_array_elements(w.audience_split) as entry
      where entry->>'country' is not null
        and length(entry->>'country') = 2
      order by coalesce((entry->>'share')::numeric, 0) desc
      limit 1
    ) as top_country
  from public.websites w
  where w.country_code = 'GB'
    and w.audience_split is not null
    and jsonb_typeof(w.audience_split) = 'array'
    and jsonb_array_length(w.audience_split) > 0
)
update public.websites w
set country_code = measured.top_country
from measured
where w.id = measured.id
  and measured.top_country is not null
  and measured.top_country <> 'GB';

-- ---------------------------------------------------------------------------
-- 2. The domain's own suffix, where it names a country.
--
-- Generated from src/lib/data/cctld.ts - do not edit by hand. Regenerate with
--     npx tsx scripts/cctld-sql.mts
-- ---------------------------------------------------------------------------
with cctld (suffix, country) as (values
  ('ae', 'AE'),
  ('al', 'AL'),
  ('ar', 'AR'),
  ('at', 'AT'),
  ('au', 'AU'),
  ('ba', 'BA'),
  ('bd', 'BD'),
  ('be', 'BE'),
  ('bg', 'BG'),
  ('bh', 'BH'),
  ('bo', 'BO'),
  ('br', 'BR'),
  ('ca', 'CA'),
  ('ch', 'CH'),
  ('ci', 'CI'),
  ('cl', 'CL'),
  ('cn', 'CN'),
  ('cr', 'CR'),
  ('cu', 'CU'),
  ('cy', 'CY'),
  ('cz', 'CZ'),
  ('de', 'DE'),
  ('dk', 'DK'),
  ('dz', 'DZ'),
  ('ec', 'EC'),
  ('ee', 'EE'),
  ('eg', 'EG'),
  ('es', 'ES'),
  ('et', 'ET'),
  ('fi', 'FI'),
  ('fr', 'FR'),
  ('gh', 'GH'),
  ('gr', 'GR'),
  ('gt', 'GT'),
  ('hk', 'HK'),
  ('hn', 'HN'),
  ('hr', 'HR'),
  ('hu', 'HU'),
  ('id', 'ID'),
  ('ie', 'IE'),
  ('il', 'IL'),
  ('in', 'IN'),
  ('is', 'IS'),
  ('it', 'IT'),
  ('jo', 'JO'),
  ('jp', 'JP'),
  ('ke', 'KE'),
  ('kh', 'KH'),
  ('kr', 'KR'),
  ('kw', 'KW'),
  ('kz', 'KZ'),
  ('lb', 'LB'),
  ('lk', 'LK'),
  ('lt', 'LT'),
  ('lu', 'LU'),
  ('lv', 'LV'),
  ('ma', 'MA'),
  ('mk', 'MK'),
  ('mn', 'MN'),
  ('mt', 'MT'),
  ('mx', 'MX'),
  ('my', 'MY'),
  ('ng', 'NG'),
  ('ni', 'NI'),
  ('nl', 'NL'),
  ('no', 'NO'),
  ('np', 'NP'),
  ('nz', 'NZ'),
  ('om', 'OM'),
  ('pa', 'PA'),
  ('pe', 'PE'),
  ('ph', 'PH'),
  ('pk', 'PK'),
  ('pl', 'PL'),
  ('pt', 'PT'),
  ('py', 'PY'),
  ('qa', 'QA'),
  ('ro', 'RO'),
  ('rs', 'RS'),
  ('ru', 'RU'),
  ('sa', 'SA'),
  ('se', 'SE'),
  ('sg', 'SG'),
  ('si', 'SI'),
  ('sk', 'SK'),
  ('sn', 'SN'),
  ('sv', 'SV'),
  ('th', 'TH'),
  ('tn', 'TN'),
  ('tr', 'TR'),
  ('tw', 'TW'),
  ('tz', 'TZ'),
  ('ua', 'UA'),
  ('ug', 'UG'),
  ('uk', 'GB'),
  ('us', 'US'),
  ('uy', 'UY'),
  ('uz', 'UZ'),
  ('ve', 'VE'),
  ('vn', 'VN'),
  ('za', 'ZA')
)
update public.websites w
set country_code = cctld.country
from cctld
where w.country_code = 'GB'
  -- The last label of the domain, lowercased. `example.com.au` and
  -- `example.au` both land on 'au', so no second-level list is needed.
  and lower(regexp_replace(w.domain, '^.*\.', '')) = cctld.suffix
  and cctld.country <> 'GB';

-- ---------------------------------------------------------------------------
-- What this left behind.
--
-- Last in the file on purpose: the Supabase SQL editor shows only the final
-- result set, so this is the one that appears.
-- ---------------------------------------------------------------------------
select
  coalesce(country_code, '(not stated)') as market,
  count(*) as listings
from public.websites
group by 1
order by listings desc, market;
