\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Selecting a whole filter, a window at a time.
--
-- 0067's id list returned everything in one call and the checkbox reported
-- "1000 selected" against 12,246 listings. The function was right; the single
-- call was not. PostgREST caps what one response carries and says nothing
-- about having done it, which is the failure `paged.ts` exists to stop.
--
-- So the thing worth asserting is the walk, and specifically the two
-- properties that make it a walk rather than a guess: consecutive windows
-- cover the filter with nothing missing, and nothing arrives twice. Both are
-- checked against a filter with more rows than any one window returns, which
-- is the only size at which either can fail.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
select 'aw-walk-' || n, 'awwalk-' || n || '.test', 'Walk ' || n, 'active', 'GB', 'stated', 'en'
from generate_series(1, 450) as n
on conflict (slug) do nothing;

select 'the filter is larger than the window being used: ' ||
  (select count(*) = 450 from public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 1000, p_offset := 0));

-- ------------------------------------------------------------------- the walk

/*
  Five windows of a hundred, which is how the caller reads it.

  Written as a `generate_series` over the offsets rather than five hand-typed
  calls, so the check cannot pass by accident of a window nobody wrote down.
*/
select 'consecutive windows cover the whole filter: ' ||
  (select coalesce(count(distinct w.id) = 450, false)
   from generate_series(0, 400, 100) as off
   cross join lateral public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 100, p_offset := off) w);

/*
  Distinct against total, not against 450.

  The first version of this compared `count(*)` to 450, which five windows of
  a hundred over a 450-row filter produce whatever order the function returns
  them in - a check that passes while rows are being repeated and others
  skipped. The sibling check above caught the dropped tiebreak and this one
  did not, which is how it was found.
*/
select 'and no listing arrives in two of them: ' ||
  (select coalesce(count(*) = count(distinct w.id), false)
   from generate_series(0, 400, 100) as off
   cross join lateral public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 100, p_offset := off) w);

select 'a window past the end is empty rather than an error: ' ||
  (select count(*) = 0 from public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 100, p_offset := 450));

select 'the last window is short rather than padded: ' ||
  (select count(*) = 50 from public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 100, p_offset := 400));

/*
  The order is the same one the page uses.

  The walk is by offset, and offset paging over an order the database may
  break ties in differently on each call skips rows and repeats others. Both
  of the checks above would catch that, which is why they are counted across
  windows rather than within one.
*/
select 'the id list is in the same order as the page: ' ||
  (select coalesce(
    (select array_agg(id order by ord)
     from (select id, row_number() over () as ord
           from public.admin_website_page(p_search := 'awwalk-', p_status := 'all', p_limit := 25, p_offset := 0)) a)
      = (select array_agg(id order by ord)
         from (select id, row_number() over () as ord
               from public.admin_website_ids(p_search := 'awwalk-', p_status := 'all', p_limit := 25, p_offset := 0)) b),
    false));

-- -------------------------------------------------------------------- the cap

/*
  A thousand a call, whatever is asked for.

  The figure PostgREST would impose anyway. It is stated here so the limit is
  one the database declares rather than one a caller discovers at 12,246
  listings - which is how this was found.
*/
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
select 'aw-many-' || n, 'awmany-' || n || '.test', 'Many ' || n, 'active', 'GB', 'stated', 'en'
from generate_series(1, 1100) as n
on conflict (slug) do nothing;

select 'the filter really does have more rows than the cap: ' ||
  (select count(*) = 1100 from public.websites where slug like 'aw-many-%');

select 'a window is capped at a thousand however large the ask: ' ||
  (select count(*) = 1000 from public.admin_website_ids(p_search := 'awmany-', p_status := 'all', p_limit := 100000, p_offset := 0));

select 'and the walk still reaches the end past the cap: ' ||
  (select coalesce(count(distinct w.id) = 1100, false)
   from generate_series(0, 1000, 500) as off
   cross join lateral public.admin_website_ids(p_search := 'awmany-', p_status := 'all', p_limit := 500, p_offset := off) w);

select 'a null limit is the default rather than everything: ' ||
  (select count(*) = 1000 from public.admin_website_ids(p_search := 'awmany-', p_status := 'all', p_limit := null, p_offset := 0));

-- ---------------------------------------------------------------- the domains

/*
  Domains for a selection, and nothing else in the answer.

  Copy domains produces a list for somebody else's tool. It used to come back
  through the admin row read - metrics, services, niche prices, contacts,
  commercials, and every listing priced - to use one column.
*/
select 'the domains come back for the ids asked for: ' ||
  (select coalesce(string_agg(d.domain, ',' order by d.domain), 'nothing')
          = 'awwalk-1.test,awwalk-2.test'
   from public.admin_website_domains(
     array(select id from public.websites where slug in ('aw-walk-1', 'aw-walk-2'))
   ) d);

select 'an id we do not have is simply absent: ' ||
  (select count(*) = 0
   from public.admin_website_domains(array['00000000-0000-4000-8000-00000000dead']::uuid[]) d);

select 'an empty selection is an empty answer, not an error: ' ||
  (select count(*) = 0 from public.admin_website_domains('{}'::uuid[]) d);

select 'and so is a null one: ' ||
  (select count(*) = 0 from public.admin_website_domains(null) d);

/*
  Two columns, and they are the two named.

  The point of this function is what it does not return. A later edit that
  widened the select to `w.*` would put publisher costs into a paste box.
*/
select 'it returns the id and the domain and nothing else: ' ||
  (select coalesce(string_agg(p.name, ',' order by p.ordinality), 'nothing') = 'id,domain'
   from unnest(
     (select proargnames from pg_proc
      where proname = 'admin_website_domains' and pronamespace = 'public'::regnamespace)
   ) with ordinality as p(name, ordinality)
   where p.name <> 'p_ids');

-- ------------------------------------------------- who may call these at all

do $$
declare
  fn text;
  r text;
  v_refused boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach fn in array array[
      'select * from public.admin_website_ids(p_search := ''a'', p_status := ''all'', p_limit := 10, p_offset := 0)',
      'select * from public.admin_website_domains(''{}''::uuid[])'
    ] loop
      v_refused := false;
      begin
        execute format('set local role %I', r);
        execute fn;
      exception when insufficient_privilege then
        v_refused := true;
      end;
      reset role;
      raise notice '% is refused: % -> %', r, left(fn, 44), v_refused;
    end loop;
  end loop;
end;
$$;

/*
  The two-argument version is gone, not left behind.

  An overload that still returned everything in one call would be the bug
  0068 fixes, reachable by anyone who did not notice there were now two.
*/
select 'only one admin_website_ids exists: ' ||
  (select count(*) = 1 from pg_proc
   where proname = 'admin_website_ids' and pronamespace = 'public'::regnamespace);
