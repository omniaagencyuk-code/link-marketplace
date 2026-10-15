\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The header and footer menus.
--
-- The odd one out in this schema, and deliberately: everything internal here
-- lives in its own table with an admin-only policy, and this table has a
-- select policy for everybody. What it holds is the navigation printed into
-- the markup of every public page - a header a signed-out visitor could not
-- read would be a header a signed-out visitor could not see.
--
-- The half that matters is the writing. These links go into everybody's
-- markup, so an anon write here would be stored cross-site content, and the
-- checks below are mostly about who is refused.
--
-- The other thing asserted is that no row is a legitimate state. A menu with
-- no row renders the arrays in src/lib/config/navigation.ts, which is what
-- makes the migration safe to run on a live site and what makes "reset" a
-- delete rather than a re-typing of today's defaults.
-- ---------------------------------------------------------------------------

select 'the table ships empty, which is the shipped navigation: ' ||
  (select count(*) = 0 from public.navigation_menus);

insert into public.navigation_menus (key, items, updated_by)
values (
  'footer',
  '[{"label": "Services", "href": "", "description": "", "children": [
      {"label": "Link building", "href": "/link-building", "description": "", "children": []}
    ]}]'::jsonb,
  'admin@test'
);

select 'a menu can be stored: ' ||
  (select jsonb_array_length(items) = 1 from public.navigation_menus where key = 'footer');

select 'and it remembers who stored it: ' ||
  (select updated_by = 'admin@test' from public.navigation_menus where key = 'footer');

-- ------------------------------------------------- what the column refuses

do $$
begin
  insert into public.navigation_menus (key, items) values ('sidebar', '[]'::jsonb);
  raise notice 'a menu nothing renders was accepted: false';
exception
  when check_violation then raise notice 'a menu nothing renders is refused: true';
end;
$$;

/*
  An object is not a menu. Every menu is a list, and a row holding `{}` would
  be read as no menu at all - so the column says so here rather than leaving
  it to whatever parses it first.
*/
do $$
begin
  insert into public.navigation_menus (key, items)
  values ('header-signed-in', '{"label": "Marketplace"}'::jsonb);
  raise notice 'an object was accepted as a menu: false';
exception
  when check_violation then raise notice 'an object is refused as a menu: true';
end;
$$;

insert into public.navigation_menus (key) values ('header-signed-out');

select 'a row with no items is an empty menu rather than a null one: ' ||
  (select items = '[]'::jsonb from public.navigation_menus where key = 'header-signed-out');

-- ------------------------------------------------- the row remembers edits

update public.navigation_menus
   set updated_at = timezone('utc', now()) - interval '2 days'
 where key = 'footer';

with touched as (
  update public.navigation_menus
     set items = '[{"label": "Legal", "href": "", "description": "", "children": []}]'::jsonb
   where key = 'footer'
  returning updated_at
)
select 'saving a menu moves its timestamp on: ' ||
  (select updated_at > timezone('utc', now()) - interval '1 minute' from touched);

-- ------------------------------------------------------------- who may look

set role anon;

/*
  The deliberate difference from every other internal table. This is the one
  read a signed-out visitor has to be able to make.
*/
select 'anon reads the menus, because they are the public navigation: ' ||
  (select count(*) = 2 from public.navigation_menus);

do $$
begin
  insert into public.navigation_menus (key, items)
  values ('header-signed-in', '[{"label": "Free money", "href": "https://example.test", "description": "", "children": []}]'::jsonb);
  raise notice 'anon added a link to every page on the site: false';
exception
  when insufficient_privilege then raise notice 'anon cannot add a link to every page: true';
  when others then raise notice 'anon cannot add a link to every page: true';
end;
$$;

do $$
declare changed integer;
begin
  update public.navigation_menus set items = '[]'::jsonb where key = 'footer';
  get diagnostics changed = row_count;
  -- A refused update is silent under row level security: no error, no rows.
  -- So the assertion is on the count rather than on an exception.
  raise notice 'anon cannot rewrite a menu: %', (changed = 0);
end;
$$;

do $$
declare removed integer;
begin
  delete from public.navigation_menus where key = 'footer';
  get diagnostics removed = row_count;
  raise notice 'anon cannot delete a menu: %', (removed = 0);
end;
$$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-9200-000000000001';

select 'a signed-in customer reads them too: ' ||
  (select count(*) = 2 from public.navigation_menus);

do $$
declare changed integer;
begin
  update public.navigation_menus set items = '[]'::jsonb where key = 'footer';
  get diagnostics changed = row_count;
  raise notice 'a customer cannot rewrite a menu either: %', (changed = 0);
end;
$$;

reset request.jwt.claim.sub;
reset role;

select 'the footer menu survived both of them: ' ||
  (select items -> 0 ->> 'label' = 'Legal' from public.navigation_menus where key = 'footer');

-- ------------------------------------------------------------- resetting one

delete from public.navigation_menus where key = 'footer';

/*
  A delete rather than a write of today's defaults, so that a menu reset now
  keeps following the code later. Writing the current arrays into the row
  would freeze them: add a page to the footer in a later release and this
  menu would be the only one that never got it.
*/
select 'resetting a menu leaves no row, so the code renders again: ' ||
  (select count(*) = 0 from public.navigation_menus where key = 'footer');

-- ------------------------------------------------------------- the policies

select 'the table carries two policies: ' ||
  (select count(*) = 2 from pg_policies
    where schemaname = 'public' and tablename = 'navigation_menus');

select 'one of them lets anybody read: ' ||
  (select count(*) = 1 from pg_policies
    where schemaname = 'public' and tablename = 'navigation_menus'
      and cmd = 'SELECT' and qual = 'true');

select 'and the other is the admin''s, on both halves: ' ||
  (select count(*) = 1 from pg_policies
    where schemaname = 'public' and tablename = 'navigation_menus'
      and cmd = 'ALL' and qual like '%is_admin%' and with_check like '%is_admin%');

select 'row level security is on: ' ||
  (select relrowsecurity from pg_class where oid = 'public.navigation_menus'::regclass);
