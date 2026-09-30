\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- A page's sections are public copy, except when they are not.
--
-- Three ways a section must stay out of a stranger's reach, and the policy
-- states all three in one expression, which is exactly the kind of expression
-- that is wrong in a way nobody notices:
--
--   - a hidden section is switched off
--   - a section of an unpublished custom page is a draft
--   - a page registered in code has no custom_pages row at all, and must not
--     be caught by the draft rule as a side effect
--
-- The third is the one worth pinning. Written the obvious way - "visible if a
-- published page exists at this slug" - the homepage disappears, because
-- there is no row for it anywhere.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777777', 'sections-admin@test');
update public.profiles set role = 'admin' where email = 'sections-admin@test';

-- A page registered in code: no custom_pages row.
insert into public.page_sections (page_slug, component, position, values)
values ('home', 'rich-text', 0, '{"heading":"Registered page"}'::jsonb);

-- A published page created in the admin.
insert into public.custom_pages (slug, label, published)
values ('broken-link-building', 'Broken link building', true);
insert into public.page_sections (page_slug, component, position, values)
values ('broken-link-building', 'rich-text', 0, '{"heading":"Published"}'::jsonb);

-- A draft page created in the admin.
insert into public.custom_pages (slug, label, published)
values ('secret-launch', 'Secret launch', false);
insert into public.page_sections (page_slug, component, position, values)
values ('secret-launch', 'rich-text', 0, '{"heading":"Not announced yet"}'::jsonb);

-- A section switched off on a published page.
insert into public.page_sections (page_slug, component, position, hidden, values)
values ('broken-link-building', 'cta', 1, true, '{"heading":"Switched off"}'::jsonb);

select 'fixtures: sections=' || (select count(*) from public.page_sections);

-- ---------------------------------------------------------------- as anon
set role anon;

select 'anon sees sections: ' || count(*) from public.page_sections;
select 'anon sees the registered page: ' || count(*)
  from public.page_sections where page_slug = 'home';
select 'anon sees the published page: ' || count(*)
  from public.page_sections where page_slug = 'broken-link-building';
select 'anon sees the draft page: ' || count(*)
  from public.page_sections where page_slug = 'secret-launch';
select 'anon sees hidden sections: ' || count(*)
  from public.page_sections where hidden;

-- A stranger cannot write one either, policy or no policy elsewhere.
do $$
begin
  insert into public.page_sections (page_slug, component, position)
  values ('home', 'cta', 9);
  raise notice 'anon wrote a section: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'anon writing a section is refused: true';
end $$;

reset role;

-- ------------------------------------------------------------ as an admin
set role authenticated;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';

-- The admin area signs in with a shared password and carries no auth.uid(),
-- so its writes go through the service-role client rather than this path.
-- What matters here is that an admin *reading* sees the drafts and the
-- hidden rows, which is what the editor needs.
select 'admin sees sections: ' || count(*) from public.page_sections;
select 'admin sees the draft page: ' || count(*)
  from public.page_sections where page_slug = 'secret-launch';
select 'admin sees hidden sections: ' || count(*)
  from public.page_sections where hidden;

reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------- positions, and swapping
--
-- The unique constraint is deferrable so that reordering works. A swap moves
-- the first row onto the second's number before the second has vacated it,
-- and a constraint checked per row rejects that halfway through.
do $$
begin
  update public.page_sections
  set position = case position when 0 then 1 else 0 end
  where page_slug = 'broken-link-building';
  raise notice 'two sections can swap places in one statement: true';
exception when others then
  raise notice 'two sections can swap places in one statement: FALSE - %', sqlerrm;
end $$;

-- But two sections still cannot end up sharing one.
do $$
begin
  insert into public.page_sections (page_slug, component, position)
  values ('broken-link-building', 'cta', 0);
  raise notice 'a duplicate position was allowed: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'a duplicate position on one page is refused: true';
end $$;

-- ----------------------------------------------------------- global links
--
-- Deleting a global detaches the pages using it rather than deleting their
-- sections, which would take a live page's content with it.
insert into public.global_sections (id, name, component, values)
values ('44444444-4444-4444-4444-444444444444', 'Main signup CTA', 'cta', '{"heading":"Join"}'::jsonb);

insert into public.page_sections (page_slug, component, position, global_id)
values ('home', 'cta', 5, '44444444-4444-4444-4444-444444444444');

select 'sections pointing at the global: ' || count(*)
  from public.page_sections where global_id is not null;

delete from public.global_sections where id = '44444444-4444-4444-4444-444444444444';

select 'sections surviving the global being deleted: ' || count(*)
  from public.page_sections where page_slug = 'home' and component = 'cta';
select 'and now detached: ' || count(*)
  from public.page_sections where page_slug = 'home' and component = 'cta' and global_id is null;

-- ------------------------------------------------------------- the shape
--
-- jsonb happily stores a bare string or a number. Every reader of these
-- columns expects an object.
do $$
begin
  insert into public.page_sections (page_slug, component, position, values)
  values ('home', 'cta', 7, '"just a string"'::jsonb);
  raise notice 'a string was stored as a section value: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'a section value has to be an object: true';
end $$;

-- ------------------------------------------------------------- reordering
--
-- Dragging a section up renumbers most of the page. The function does it in
-- one statement so the deferrable constraint is checked once, at the end,
-- when the new order is complete - a row at a time collides halfway through.
insert into public.page_sections (id, page_slug, component, position) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'reorder-me', 'rich-text', 0),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'reorder-me', 'cta', 1),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'reorder-me', 'faq', 2),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'reorder-me', 'feature-cards', 3);

set role authenticated;
set request.jwt.claim.sub = '77777777-7777-7777-7777-777777777777';

select 'reordered rows: ' || public.reorder_page_sections('reorder-me', array[
  'aaaaaaaa-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000002'
]::uuid[]);

select 'new order: ' || string_agg(component, ', ' order by position)
  from public.page_sections where page_slug = 'reorder-me';

-- A section from another page cannot be dragged in by naming its id: the
-- update would set its position and never touch its page_slug, so it would
-- appear in two orders at once.
do $$
begin
  perform public.reorder_page_sections('reorder-me', array[
    'aaaaaaaa-0000-0000-0000-000000000001',
    (select id from public.page_sections where page_slug = 'home' limit 1)
  ]::uuid[]);
  raise notice 'a section from another page was pulled in: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'a section from another page is refused: true';
end $$;

reset role;
reset request.jwt.claim.sub;

-- --------------------------------------------- as the admin area itself
--
-- The case that matters, and the one this file did not have.
--
-- Every test above signs in as an administrator through Supabase Auth. The
-- admin area does not: it signs in with a shared password, carries no
-- auth.uid(), and writes through the service-role client - which is stated
-- at the top of this file and was then not tested.
--
-- So the function's own `is_admin()` check, which is false without an
-- auth.uid(), refused every reorder the application ever made. The arrows
-- did nothing, dragging did nothing, and nothing anywhere said so. 0039
-- deletes that second copy of the rule and lets the table's policies decide.
set role service_role;
do $$
declare moved integer;
begin
  moved := public.reorder_page_sections('reorder-me', array[
    'aaaaaaaa-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000004',
    'aaaaaaaa-0000-0000-0000-000000000001'
  ]::uuid[]);
  raise notice 'the admin area can reorder a page: true (% rows)', moved;
exception when others then
  raise notice 'the admin area can reorder a page: FALSE - %', sqlerrm;
end $$;
reset role;

select 'order after the admin area moved it: ' || string_agg(component, ', ' order by position)
  from public.page_sections where page_slug = 'reorder-me';

-- And it still refuses a section from another page, which is the check the
-- function keeps for itself because no policy can express it.
set role service_role;
do $$
begin
  perform public.reorder_page_sections('reorder-me', array[
    'aaaaaaaa-0000-0000-0000-000000000001',
    (select id from public.page_sections where page_slug = 'home' limit 1)
  ]::uuid[]);
  raise notice 'the admin area pulled in another page''s section: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'another page''s section is still refused: true';
end $$;
reset role;

-- Running as the caller means the table's policies decide, so a stranger is
-- refused by the database rather than by a check the function keeps.
set role anon;
do $$
declare moved integer;
begin
  moved := public.reorder_page_sections('reorder-me', array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  if moved > 0 then
    raise notice 'anon reordered a page: TRUE - THIS IS A BUG';
  else
    raise notice 'anon reordering a page moves nothing: true';
  end if;
exception when others then
  raise notice 'anon reordering a page is refused: true';
end $$;
reset role;

select 'order after the refusals: ' || string_agg(component, ', ' order by position)
  from public.page_sections where page_slug = 'reorder-me';

-- ---------------------------------------------------------------------------
-- Every write the admin area makes, as the client it makes them with.
--
-- The reorder bug was not that the function was wrong. It was that nothing
-- here had ever exercised the service-role path, so a rule that was right for
-- a signed-in administrator and wrong for the only client the application has
-- passed every test and failed in production.
--
-- So each operation the section editor performs is run here as `service_role`,
-- which is what `getAdminScopedClient()` is. They should all succeed: the
-- service role bypasses row level security, and anything that refuses it is a
-- second copy of an authorisation rule hiding somewhere.
-- ---------------------------------------------------------------------------

insert into public.page_sections (id, page_slug, component, position, locked) values
  ('cccccccc-0000-0000-0000-000000000001', 'admin-writes', 'hero', 0, true),
  ('cccccccc-0000-0000-0000-000000000002', 'admin-writes', 'rich-text', 1, false);

set role service_role;

-- add a section
do $$
begin
  insert into public.page_sections (id, page_slug, component, position)
  values ('cccccccc-0000-0000-0000-000000000003', 'admin-writes', 'faq', 2);
  raise notice 'the admin area can add a section: true';
exception when others then
  raise notice 'the admin area can add a section: FALSE - %', sqlerrm;
end $$;

-- save its content and its entrance
do $$
begin
  update public.page_sections
  set values = '{"heading":"Questions"}'::jsonb,
      animation = '{"entrance":"fade-up","speed":"normal","delay":"none"}'::jsonb
  where id = 'cccccccc-0000-0000-0000-000000000003';
  raise notice 'the admin area can save a section: true (% rows)', (select count(*) from public.page_sections where id = 'cccccccc-0000-0000-0000-000000000003' and values ? 'heading');
exception when others then
  raise notice 'the admin area can save a section: FALSE - %', sqlerrm;
end $$;

-- hide it, then show it again
do $$
declare hid boolean;
begin
  update public.page_sections set hidden = true where id = 'cccccccc-0000-0000-0000-000000000003';
  select hidden into hid from public.page_sections where id = 'cccccccc-0000-0000-0000-000000000003';
  update public.page_sections set hidden = false where id = 'cccccccc-0000-0000-0000-000000000003';
  raise notice 'the admin area can hide a section: %', hid;
exception when others then
  raise notice 'the admin area can hide a section: FALSE - %', sqlerrm;
end $$;

-- share it across pages, then detach it
do $$
begin
  insert into public.global_sections (id, name, component, values)
  values ('cccccccc-1111-0000-0000-000000000001', 'Shared questions', 'faq', '{"heading":"Questions"}'::jsonb);
  update public.page_sections set global_id = 'cccccccc-1111-0000-0000-000000000001'
  where id = 'cccccccc-0000-0000-0000-000000000003';
  update public.page_sections set global_id = null
  where id = 'cccccccc-0000-0000-0000-000000000003';
  raise notice 'the admin area can share and detach a section: true';
exception when others then
  raise notice 'the admin area can share and detach a section: FALSE - %', sqlerrm;
end $$;

-- A locked section is refused, and `locked = false` is the filter the
-- application sends: the button is hidden, the action checks, and the query
-- carries it too, which is the only one of the three a crafted request cannot
-- go around.
with removed as (
  delete from public.page_sections
  where id = 'cccccccc-0000-0000-0000-000000000001' and locked = false
  returning id
)
select 'deleting a locked section removes: ' || count(*) from removed;

-- An unlocked one goes.
with removed as (
  delete from public.page_sections
  where id = 'cccccccc-0000-0000-0000-000000000003' and locked = false
  returning id
)
select 'deleting an unlocked section removes: ' || count(*) from removed;

reset role;

select 'admin-writes still has: ' || string_agg(component, ', ' order by position)
  from public.page_sections where page_slug = 'admin-writes';

-- ---------------------------------------------------------------------------
-- A pending edit is not readable by a visitor, however they ask.
--
-- This is the test that was missing when drafts shipped. There was one, and
-- it asked the question the application asks - "does the public read return a
-- draft" - which the public read answered correctly by naming its columns.
--
-- A visitor is not limited to the queries the application makes. The
-- publishable key ships in the browser bundle, so anyone can ask PostgREST
-- for any column of any row a policy lets them see:
--
--     GET /rest/v1/page_sections?select=draft&page_slug=eq.home
--
-- Row level security is row level. It came straight back.
--
-- So the drafts live in their own table with one policy, and the question
-- asked here is the one that matters: can anybody who is not an administrator
-- read this table at all.
-- ---------------------------------------------------------------------------

insert into public.page_sections (id, page_slug, component, position, values)
values ('eeeeeeee-0000-0000-0000-000000000001', 'draft-test', 'rich-text', 0,
        '{"heading":"Published"}'::jsonb);

insert into public.section_drafts (section_id, values)
values ('eeeeeeee-0000-0000-0000-000000000001',
        '{"heading":"A CHANGE NOBODY HAS PUBLISHED"}'::jsonb);

select 'the page still renders: ' || (values->>'heading')
  from public.page_sections where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- ------------------------------------------------------------------ as anon
set role anon;

select 'anon sees drafts: ' || count(*) from public.section_drafts;

-- Asked by name, which is what a crafted request does.
do $$
declare leaked text;
begin
  select values->>'heading' into leaked
  from public.section_drafts
  where section_id = 'eeeeeeee-0000-0000-0000-000000000001';

  if leaked is null then
    raise notice 'anon reading a draft by name: refused';
  else
    raise notice 'anon read a draft: % - THIS IS A BUG', leaked;
  end if;
end $$;

-- And through the section it belongs to, in case a join is the way in.
do $$
declare leaked text;
begin
  select draft.values->>'heading' into leaked
  from public.page_sections section
  join public.section_drafts draft on draft.section_id = section.id
  where section.page_slug = 'draft-test';

  if leaked is null then
    raise notice 'anon reading a draft through its section: refused';
  else
    raise notice 'anon joined its way to a draft: % - THIS IS A BUG', leaked;
  end if;
end $$;

-- A stranger cannot stage one either.
do $$
begin
  insert into public.section_drafts (section_id, values)
  values ('eeeeeeee-0000-0000-0000-000000000001', '{"heading":"mine now"}'::jsonb);
  raise notice 'anon staged a change: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'anon staging a change is refused: true';
end $$;

reset role;

-- ------------------------------------------- as a signed-in, non-admin user
--
-- The other half of the reason this is its own table: a customer is signed in
-- and still has no business seeing what a marketing page is about to say.
insert into auth.users (id, email) values
  ('88888888-8888-8888-8888-888888888888', 'customer-drafts@test');

set role authenticated;
set request.jwt.claim.sub = '88888888-8888-8888-8888-888888888888';
select 'a signed-in customer sees drafts: ' || count(*) from public.section_drafts;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------- as the admin area
set role service_role;
select 'the admin area reads the draft: ' || (values->>'heading')
  from public.section_drafts where section_id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;

-- Deleting the section takes its pending edit with it: the foreign key is the
-- cleanup, which is most of why this is a table rather than a second store.
delete from public.page_sections where id = 'eeeeeeee-0000-0000-0000-000000000001';
select 'drafts left after the section went: ' || count(*)
  from public.section_drafts where section_id = 'eeeeeeee-0000-0000-0000-000000000001';
