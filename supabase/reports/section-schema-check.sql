/*
  Is the sections schema actually what the code expects? Read-only.

  Paste into the Supabase SQL editor and run. It reads only catalogue tables
  and a count, writes nothing, and leaves nothing behind.

  Why this exists: the page editor reads every section with one SELECT naming
  every column, and PostgREST rejects the whole statement if one of them is
  missing - so a migration that half applied shows up as "This page couldn't
  load" on the editor and nothing more specific anywhere. The sections work
  spans three migrations (0040 style and artwork, 0041, 0042 section_drafts),
  and a column missing from any of them fails the same way.

  There is a reason a page with sections can fail while a page without them
  loads: the drafts are fetched in a second query keyed by the section ids,
  and that query is skipped entirely when a page has no sections. So an
  unconverted page opens fine and the homepage does not.

  Every row should say OK. Anything that says MISSING is the answer.
*/

with wanted(table_name, column_name) as (
  values
    -- page_sections, as SECTION_SELECT names them
    ('page_sections','id'), ('page_sections','page_slug'), ('page_sections','component'),
    ('page_sections','variant'), ('page_sections','position'), ('page_sections','hidden'),
    ('page_sections','locked'), ('page_sections','animation'), ('page_sections','style'),
    ('page_sections','values'), ('page_sections','global_id'), ('page_sections','updated_at'),
    ('page_sections','updated_by'),
    -- global_sections, as GLOBAL_SELECT names them
    ('global_sections','id'), ('global_sections','name'), ('global_sections','component'),
    ('global_sections','variant'), ('global_sections','animation'), ('global_sections','style'),
    ('global_sections','values'), ('global_sections','updated_at'), ('global_sections','updated_by'),
    -- section_drafts, as DRAFT_SELECT names them, plus what setDraft writes
    ('section_drafts','section_id'), ('section_drafts','variant'), ('section_drafts','animation'),
    ('section_drafts','style'), ('section_drafts','values'), ('section_drafts','updated_by')
)

select
  1 as sort,
  w.table_name as thing,
  w.column_name as detail,
  case when c.column_name is null then 'MISSING' else 'OK · ' || c.data_type end as state
from wanted w
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = w.table_name
 and c.column_name = w.column_name
where c.column_name is null          -- only the problems, so OK is a short report

union all
-- The three tables themselves, since a missing table reads differently from
-- a missing column and is the likelier half-applied migration.
select 2, 'table', t.name,
       case when to_regclass('public.' || t.name) is null then 'MISSING' else 'OK' end
from (values ('page_sections'),('global_sections'),('section_drafts')) as t(name)

union all
/*
  Counted through query_to_xml rather than by naming the table.

  A plain `select count(*) from public.section_drafts` inside a CASE branch
  is still resolved when the statement is parsed, so the guard never runs and
  this report fails with "relation does not exist" in precisely the case it
  was written to diagnose. The same trap migration 0042 had to work around.
  query_to_xml takes the query as a string, so nothing is resolved until the
  CASE has already decided to call it.
*/
select 3, 'how many sections', 'on the homepage', countOf.n
from (select case when to_regclass('public.page_sections') is null then 'table missing'
       else (xpath('/row/c/text()',
              query_to_xml('select count(*) as c from public.page_sections where page_slug = ''home''',
                           false, true, '')))[1]::text end as n) as countOf

union all
select 4, 'pending previews', 'rows in section_drafts', draftsOf.n
from (select case when to_regclass('public.section_drafts') is null then 'TABLE MISSING'
       else (xpath('/row/c/text()',
              query_to_xml('select count(*) as c from public.section_drafts', false, true, '')))[1]::text end as n) as draftsOf

union all
select 5, 'verdict', 'columns missing',
       (select count(*)::text
        from wanted w2
        left join information_schema.columns c2
          on c2.table_schema = 'public' and c2.table_name = w2.table_name
         and c2.column_name = w2.column_name
        where c2.column_name is null)

order by sort, thing, detail;
