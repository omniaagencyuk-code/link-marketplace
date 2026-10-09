\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- One page of the admin website table.
--
-- The table used to be handed the whole inventory and filter, sort and page
-- it in the browser. These two functions take that job, so what is worth
-- asserting is that they take it *exactly*: the same search rule, the same
-- order, the same statuses, and a total that counts the filter rather than
-- the page.
--
-- Two of these would pass whatever the function did if they were written the
-- easy way. The ordering checks name the rows they expect in order rather
-- than counting them, and the cap is checked against a filter that really
-- has more rows than the cap - a cap asserted against 6 rows asserts
-- nothing.
-- ---------------------------------------------------------------------------

/*
  Five listings with a timestamp each, and the niche set in the insert.

  Set by a later `update` it would not be: `websites_set_updated_at` fires
  before every update and overwrites `updated_at` with now(), which moves the
  row to the front of the order these fixtures exist to pin down. The first
  version of this file did exactly that, and the ordering check below is what
  said so.
*/
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, updated_at)
values
  ('aw-one',   'zqadmin-one.test',   'Alpha Review awtok',         'active',   'GB', 'stated', 'en', '2026-01-05T00:00:00Z'),
  ('aw-two',   'zqadmin-two.test',   'Beta Report awtok',          'draft',    'GB', 'stated', 'en', '2026-01-04T00:00:00Z'),
  ('aw-three', 'awother-three.test', 'Gamma zqadmin Weekly awtok', 'active',   'GB', 'stated', 'en', '2026-01-03T00:00:00Z'),
  ('aw-five',  'awother-five.test',  'Epsilon Evening awtok',      'archived', 'GB', 'stated', 'en', '2026-01-01T00:00:00Z')
on conflict (slug) do nothing;

-- The niche is a category slug on the listing, and the table has always
-- searched it alongside the domain and the title.
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, updated_at, primary_category_id)
select 'aw-four', 'awother-four.test', 'Delta Daily awtok', 'paused', 'GB', 'stated', 'en', '2026-01-02T00:00:00Z', c.id
from public.categories c where c.slug = 'igaming'
on conflict (slug) do nothing;

-- ------------------------------------------------------------ the search rule

select 'the domain is searched: ' ||
  (select count(*) = 2 from public.admin_website_page(p_search := 'zqadmin-', p_status := 'all', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id
   where w.slug in ('aw-one', 'aw-two'));

select 'the title is searched: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'gamma', p_status := 'all', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id where w.slug = 'aw-three');

select 'the niche is searched: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'igaming', p_status := 'all', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id where w.slug = 'aw-four');

select 'case does not matter: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'ALPHA REVIEW', p_status := 'all', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id where w.slug = 'aw-one');

select 'surrounding space does not matter: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := '   alpha  ', p_status := 'all', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id where w.slug = 'aw-one');

/*
  A search term is input, not a pattern.

  `%` and `_` are wildcards in a LIKE pattern, so a term containing either
  would match rows the person typing it never asked for - and `_` is in plenty
  of real domains. `position(... in ...)` has no wildcards at all, which is
  why it is used instead; this is the check that says so.
*/
select 'a per cent sign is a literal, not a wildcard: ' ||
  (select count(*) = 0 from public.admin_website_page(p_search := 'zqadmin%one', p_status := 'all', p_limit := 50, p_offset := 0));

select 'an underscore is a literal too: ' ||
  (select count(*) = 0 from public.admin_website_page(p_search := 'zqadmin_one.test', p_status := 'all', p_limit := 50, p_offset := 0));

-- -------------------------------------------------------------- the statuses

select 'a filter with no status matches all five: ' ||
  (select count(*) = 5 from public.admin_website_page(p_search := 'awtok', p_status := 'all', p_limit := 50, p_offset := 0));

select 'a status narrows it to the one listing in that status: ' ||
  (select count(*) = 1 and coalesce(min(w.slug), '') = 'aw-two'
   from public.admin_website_page(p_search := 'awtok', p_status := 'draft', p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id);

select 'the draft filter finds the draft: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'zqadmin-two', p_status := 'draft', p_limit := 50, p_offset := 0));

select 'and not a listing in another status: ' ||
  (select count(*) = 0 from public.admin_website_page(p_search := 'zqadmin-two', p_status := 'active', p_limit := 50, p_offset := 0));

/*
  Archived listings are shown.

  The read this replaces - `getAllForAdmin` - had no status filter at all, and
  the table's own dropdown offers "Archived" as one of its five choices. A
  function that quietly excluded them would empty that choice, and losing the
  archive is how somebody re-imports a site they deliberately retired.
*/
select 'an archived listing is matched by "all": ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'epsilon', p_status := 'all', p_limit := 50, p_offset := 0));

select 'and by its own status: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'epsilon', p_status := 'archived', p_limit := 50, p_offset := 0));

select 'a null status means every status: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'epsilon', p_status := null, p_limit := 50, p_offset := 0));

-- ------------------------------------------------------------------ the order

/*
  Most recently updated first, then by id.

  The order the full read arrived in, so the table is unchanged by this. The
  tiebreak matters as much as the sort: without it a row can appear on two
  pages and another on none, which reads as a listing that has gone missing.
*/
select 'the page is ordered by when it was last updated, newest first: ' ||
  coalesce((select string_agg(w.slug, ',' order by p.ord)
            from (select id, row_number() over () as ord
                  from public.admin_website_page(p_search := 'awtok', p_status := 'all', p_limit := 50, p_offset := 0)) p
            join public.websites w on w.id = p.id)
           = 'aw-one,aw-two,aw-three,aw-four,aw-five', false)::text ||
  ' (got ' || coalesce((select string_agg(w.slug, ',' order by p.ord)
                        from (select id, row_number() over () as ord
                              from public.admin_website_page(p_search := 'awtok', p_status := 'all', p_limit := 50, p_offset := 0)) p
                        join public.websites w on w.id = p.id), 'nothing') || ')';

-- Four listings sharing a timestamp, so the id tiebreak is the only thing
-- deciding their order. Without it this is whatever the planner felt like.
insert into public.websites (id, slug, domain, title, status, country_code, country_source, language_code, updated_at)
values
  ('00000000-0000-4000-8000-000000000003', 'aw-tie-c', 'awtie-c.test', 'Tie C', 'active', 'GB', 'stated', 'en', '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000001', 'aw-tie-a', 'awtie-a.test', 'Tie A', 'active', 'GB', 'stated', 'en', '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000004', 'aw-tie-d', 'awtie-d.test', 'Tie D', 'active', 'GB', 'stated', 'en', '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'aw-tie-b', 'awtie-b.test', 'Tie B', 'active', 'GB', 'stated', 'en', '2026-02-01T00:00:00Z')
on conflict (slug) do nothing;

select 'listings updated at the same moment are ordered by id: ' ||
  coalesce((select string_agg(w.slug, ',' order by p.ord)
            from (select id, row_number() over () as ord
                  from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 50, p_offset := 0)) p
            join public.websites w on w.id = p.id)
           = 'aw-tie-a,aw-tie-b,aw-tie-c,aw-tie-d', false)::text ||
  ' (got ' || coalesce((select string_agg(w.slug, ',' order by p.ord)
                        from (select id, row_number() over () as ord
                              from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 50, p_offset := 0)) p
                        join public.websites w on w.id = p.id), 'nothing') || ')';

-- ------------------------------------------------------- the total, and paging

/*
  The total counts the filter, not the page.

  It is what the footer says "of 11,042" with, and what the page count is
  divided out of. A total that counted the rows returned would read "1-2 of 2"
  on every page of a four-page list.
*/
select 'the total counts the whole filter: ' ||
  (select coalesce(min(total) = 4, false) from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 0));

select 'and is the same on the second page: ' ||
  (select coalesce(min(total) = 4, false) from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 2));

select 'a page is the size asked for: ' ||
  (select count(*) = 2 from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 0));

select 'the two pages together are the whole filter, with nothing twice: ' ||
  coalesce((select string_agg(w.slug, ',' order by w.slug)
            from (select id from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 0)
                  union all
                  select id from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 2)) p
            join public.websites w on w.id = p.id)
           = 'aw-tie-a,aw-tie-b,aw-tie-c,aw-tie-d', false)::text ||
  ' (got ' || coalesce((select string_agg(w.slug, ',' order by w.slug)
                        from (select id from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 0)
                              union all
                              select id from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 2)) p
                        join public.websites w on w.id = p.id), 'nothing') || ')';

select 'past the end is empty rather than an error: ' ||
  (select count(*) = 0 from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := 99));

-- ------------------------------------------------------------------- the cap

/*
  Two hundred and fifty a page, whatever is asked for.

  The cap is the whole point of the change: the page size is a number from the
  browser, and "all of them" was one of the choices. Asserted against a filter
  with more rows than the cap, because a cap checked against six rows is a
  check that passes whatever the number is.
*/
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
select 'aw-bulk-' || n, 'awbulk-' || n || '.test', 'Bulk ' || n, 'active', 'GB', 'stated', 'en'
from generate_series(1, 260) as n
on conflict (slug) do nothing;

select 'the filter really does have more rows than the cap: ' ||
  (select count(*) = 260 from public.admin_website_ids('awbulk-', 'all'));

select 'a page is capped at 250 however large the ask: ' ||
  (select count(*) = 250 from public.admin_website_page(p_search := 'awbulk-', p_status := 'all', p_limit := 100000, p_offset := 0));

select 'and a negative ask is still at least one row: ' ||
  (select count(*) = 1 from public.admin_website_page(p_search := 'awbulk-', p_status := 'all', p_limit := -5, p_offset := 0));

select 'a negative offset starts at the beginning: ' ||
  (select count(*) = 2 from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 2, p_offset := -10));

select 'the default page size is fifty: ' ||
  (select count(*) = 50 from public.admin_website_page(p_search := 'awbulk-', p_status := 'all', p_limit := null, p_offset := 0));

-- ------------------------------------------------------------- the whole filter

/*
  Ids for the header checkbox.

  It has always meant "everything these filters match" - filtering to "draft"
  and ticking it is how a couple of hundred listings get published in one go -
  and it must agree with the page it sits above. 0068 gave it a window; what
  it does across more than one window is tested in 25.
*/
select 'one window carries a filter this size: ' ||
  (select count(*) = 260 from public.admin_website_ids('awbulk-', 'all'));

select 'the id list honours the status filter: ' ||
  (select count(*) = 1 from public.admin_website_ids('zqadmin-two', 'draft'));

select 'the id list agrees with the total the page reports: ' ||
  (select coalesce(
    (select count(*) from public.admin_website_ids('awbulk-', 'all'))
      = (select min(total) from public.admin_website_page(p_search := 'awbulk-', p_status := 'all', p_limit := 25, p_offset := 0)),
    false));

select 'the page is the front of the id list, in the same order: ' ||
  (select coalesce(
    (select array_agg(id order by ord)
     from (select id, row_number() over () as ord
           from public.admin_website_page(p_search := 'awtie-', p_status := 'all', p_limit := 3, p_offset := 0)) a)
      = (select array_agg(id order by ord)
         from (select id, row_number() over () as ord
               from public.admin_website_ids('awtie-', 'all')) b
         where ord <= 3),
    false));

-- ------------------------------------------------- who may call these at all

/*
  The admin signs in with a shared password and carries no `auth.uid()`, so
  every admin read goes through the service role. These functions are
  `security definer`, and a `security definer` function in `public` is a
  PostgREST endpoint for anyone holding the anon key - which is in the
  browser. 0062 shipped without these revokes and `anon` could block a
  sender; what leaks here is the list of what we have not published yet.
*/
do $$
declare
  fn text;
  v_refused boolean;
begin
  foreach fn in array array[
    'select * from public.admin_website_page(p_search := ''a'', p_status := ''all'', p_limit := 5, p_offset := 0)',
    'select * from public.admin_website_ids(''a'', ''all'')'
  ] loop
    v_refused := false;
    begin
      set local role anon;
      execute fn;
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    raise notice 'anon is refused: % -> %', left(fn, 48), v_refused;
  end loop;
end;
$$;

do $$
declare
  fn text;
  v_refused boolean;
begin
  foreach fn in array array[
    'select * from public.admin_website_page(p_search := ''a'', p_status := ''all'', p_limit := 5, p_offset := 0)',
    'select * from public.admin_website_ids(''a'', ''all'')'
  ] loop
    v_refused := false;
    begin
      set local role authenticated;
      execute fn;
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    raise notice 'a signed-in customer is refused: % -> %', left(fn, 48), v_refused;
  end loop;
end;
$$;

-- ------------------------------------------------- listings with no category
/*
  The backlog 0077 exposed, and the filter that makes it workable.

  The fixtures above are already the right shape for this and it is worth
  saying why: four of the five were inserted with no `primary_category_id`
  and one was given `igaming`. So "uncategorised" here is a real split of a
  real set, not a single row contrived for the assertion.

  Each check names the rows it expects rather than counting them. A count of
  four would pass against a filter that returned the wrong four.
*/
select 'the filter is off by default: ' ||
  (select count(*) = 5 from public.admin_website_page(
     p_search := 'awtok', p_status := 'all', p_limit := 50, p_offset := 0));

select 'and off when it is asked for and false: ' ||
  (select count(*) = 5 from public.admin_website_page(
     p_search := 'awtok', p_status := 'all', p_uncategorised := false,
     p_limit := 50, p_offset := 0));

select 'uncategorised returns exactly the ones with no category: ' ||
  (select array_agg(w.slug order by w.slug) = array['aw-five','aw-one','aw-three','aw-two']
   from public.admin_website_page(
     p_search := 'awtok', p_status := 'all', p_uncategorised := true,
     p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id);

select 'and never the one that has one: ' ||
  (select count(*) = 0 from public.admin_website_page(
     p_search := 'awtok', p_status := 'all', p_uncategorised := true,
     p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id
   where w.slug = 'aw-four');

-- It narrows with the other filters rather than replacing them.
select 'it combines with status: ' ||
  (select array_agg(w.slug order by w.slug) = array['aw-one','aw-three']
   from public.admin_website_page(
     p_search := 'awtok', p_status := 'active', p_uncategorised := true,
     p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id);

select 'and with the search: ' ||
  (select array_agg(w.slug) = array['aw-three']
   from public.admin_website_page(
     p_search := 'gamma', p_status := 'all', p_uncategorised := true,
     p_limit := 50, p_offset := 0) p
   join public.websites w on w.id = p.id);

-- The total counts the filter, not the page - the rule the rest of this file
-- pins for search and status, applied to the new one.
select 'the total counts the filter and not the page: ' ||
  (select distinct total = 4 from public.admin_website_page(
     p_search := 'awtok', p_status := 'all', p_uncategorised := true,
     p_limit := 2, p_offset := 0));

/*
  The two functions have to agree, and this is the check that says so.

  `admin_website_ids` is what the header checkbox selects. If it ignored a
  filter the page honoured, ticking the box with that filter on would select
  rows the table is not showing - and a bulk action would then touch them.
  Adding a filter to one and not the other is the easy mistake here, so the
  assertion compares the two sets rather than testing each alone.
*/
select 'the select-all ids match the page under the same filter: ' ||
  (select coalesce(
     (select array_agg(id order by id) from public.admin_website_ids(
        p_search := 'awtok', p_status := 'all', p_uncategorised := true,
        p_limit := 1000, p_offset := 0))
     =
     (select array_agg(id order by id) from public.admin_website_page(
        p_search := 'awtok', p_status := 'all', p_uncategorised := true,
        p_limit := 250, p_offset := 0)),
     false));
