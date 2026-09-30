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

-- Security definer runs as the owner, so without its own check this would be
-- a way for anyone at all to rearrange a live marketing page.
set role anon;
do $$
begin
  perform public.reorder_page_sections('reorder-me', array['aaaaaaaa-0000-0000-0000-000000000001']::uuid[]);
  raise notice 'anon reordered a page: TRUE - THIS IS A BUG';
exception when others then
  raise notice 'anon reordering a page is refused: true';
end $$;
reset role;

select 'order after the refusals: ' || string_agg(component, ', ' order by position)
  from public.page_sections where page_slug = 'reorder-me';
