/*
  What the capped domain index actually did. Read-only.

  Paste the whole thing into the Supabase SQL editor and run it. It reads
  three tables, writes nothing, creates nothing and leaves nothing behind,
  so it is safe to run as often as you like.

  It is one statement on purpose: the SQL editor shows only the last result,
  so everything arrives in a single table with a `section` column.

  ---------------------------------------------------------------------------

  The importer decides create-or-update by looking a domain up in an index
  built from `websites`. That index was read with `.limit(50_000)`, PostgREST
  answered with its first thousand rows and no error, and every domain past
  the thousandth was missing from it.

  The first guess was that this created duplicate listings. It did not:
  `websites.domain` is unique, so the insert those rows fell through to was
  rejected by the database. What happened instead is that the rejection was
  counted as a failed row - so in update mode a listing that should have been
  updated was not, and whatever the CSV carried for it was never applied.

  So this checks both. Duplicates, because the unique constraint compares the
  text exactly as stored while the importer compares normalised text, and
  anything that ever wrote a domain without normalising it could sit beside
  its own twin untroubled. And import failures, because that is where the
  lost updates are.

  The normalisation below is the same chain as normaliseDomain() in
  src/lib/import/normalise.ts, in the same order: protocol, userinfo, path,
  port, www, trailing dots. The two were compared across 24 awkward inputs -
  ports, userinfo, mailto:, nested www, trailing dots, mixed case - and agreed
  on every one. If normalise.ts ever changes, this has to change with it, or
  the report quietly stops describing what the importer will actually do.
*/

with norm as (
  select
    id,
    domain,
    status,
    created_at,
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(btrim(domain)), '^[a-z][a-z0-9+.-]*://', ''),
              '^[^@/]*@', ''),
            '[/?#].*$', ''),
          ':.*$', ''),
        '^www\.', ''),
      '\.+$', '') as site
  from public.websites
),

collisions as (
  select site from norm where site <> '' group by site having count(*) > 1
)

--------------------------------------------------------------- 1. the totals
select
  1                                as sort,
  'summary'                        as section,
  'listings'                       as item,
  count(*)::text                   as detail,
  ''                               as extra
from norm

union all
select 2, 'summary', 'sites listed more than once', count(*)::text, ''
from collisions

union all
select 3, 'summary', 'rows a future import would not match',
       count(*)::text, ''
from norm where site <> domain

------------------------------------------------- 2. the same site, two rows
-- If this section is empty, the unique constraint did the whole job and
-- there is nothing to merge.
union all
select 4, 'listed twice', n.site, n.domain,
       n.status || ' · added ' || to_char(n.created_at, 'DD Mon YYYY')
from norm n join collisions c on c.site = n.site

----------------------------------------- 3. stored in a form that will bite
-- Not damage yet. A row stored like this is invisible to the next import of
-- its normalised spelling, which is then free to insert beside it.
union all
select 5, 'stored un-normalised', n.domain, 'would be matched as ' || n.site, ''
from norm n where n.site <> n.domain

--------------------------------------------------- 4. where the updates went
-- A failed row in update mode is one that should have updated a listing and
-- did not. Not every one will be this bug - a malformed domain fails the
-- same way and counts the same - and import_runs keeps counts rather than
-- rows, so it cannot say which was which. Re-importing the same file in
-- update mode settles it: the index is no longer capped, so a row that
-- failed for that reason will now match and update, and one with a bad
-- domain will fail again and be worth a look.
union all
select 6, 'import failed rows',
       to_char(created_at, 'DD Mon YYYY') || ' · ' || file_name,
       failed::text || ' failed of ' || total_rows::text || ' (' || duplicate_mode || ' mode)',
       created::text || ' created, ' || updated::text || ' updated'
from public.import_runs where failed > 0

union all
select 7, 'summary', 'failed rows in update mode (the ones to re-run)',
       coalesce(sum(failed), 0)::text, ''
from public.import_runs where failed > 0 and duplicate_mode = 'update'

order by sort, item, detail;
