-- The three menus, editable.
--
-- The header and the footer were arrays in `src/lib/config/navigation.ts`, so
-- adding a page to the footer meant a deploy. These are the same three lists
-- in a table an administrator can edit.
--
-- ## One shape for all three
--
-- A header item with a dropdown and a footer column are the same thing: a
-- labelled node with children. So all three menus are one jsonb array of
-- `{label, href, description, children}`, and what differs is only how each
-- is drawn - the footer gives a parent a column and ignores its href, the
-- header gives it a dropdown. `src/lib/navigation/menus.ts` is where the
-- shape is validated, and it reads a malformed row as no menu at all.
--
-- ## Why no row is the normal state
--
-- A menu with no row renders what ships in code, which is the arrangement
-- `page_sections` has with its fallback. So this migration changes nothing on
-- the day it runs: the header and footer are exactly what they were, and they
-- stay that way until somebody saves. Resetting a menu is a delete.
--
-- ## Why this one is publicly readable
--
-- Everything internal in this schema sits in its own table with an admin-only
-- policy, and this looks like one of those until you notice what it holds: a
-- menu is the navigation printed into the markup of every public page. It is
-- as public as data gets, and a header that could not be read without an
-- account would be a header nobody signed out could see.
--
-- Writing is admin-only, which is the half that matters: these links are in
-- every page's markup, so an anon insert here is stored cross-site content.
-- `src/lib/navigation/menus.ts` refuses an href that is not a path, an
-- http(s) URL, a mailto or a tel for the same reason, on the way out.

create table if not exists public.navigation_menus (
  key text primary key,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,

  constraint navigation_menus_known_key
    check (key in ('header-signed-out', 'header-signed-in', 'footer')),
  -- An array, because every menu is a list. A row holding an object would
  -- read as no menu rather than as a menu, and the check says so here rather
  -- than leaving it to whatever happens to parse it first.
  constraint navigation_menus_items_array
    check (jsonb_typeof(items) = 'array')
);

comment on table public.navigation_menus is
  'The site header and footer menus, one row per menu. No row means the menu in src/lib/config/navigation.ts renders instead, so an empty table is the shipped navigation and deleting a row is how a menu is reset. Publicly readable because it is the navigation on every public page; admin-only to write, because these links go into everybody''s markup.';

comment on column public.navigation_menus.items is
  'An array of {label, href, description, children}. One level of nesting: the header draws children as a dropdown, the footer draws a parent as a column heading and its children as the links under it. Validated by src/lib/navigation/menus.ts, which drops any href that is not a path, an http(s) URL, a mailto or a tel.';

alter table public.navigation_menus enable row level security;

-- Readable by anybody, signed in or not. A signed-out visitor needs the
-- header, which is the whole point of the signed-out header.
do $$ begin
  create policy "Anyone reads the menus"
    on public.navigation_menus for select
    using (true);
exception when duplicate_object then null; end; $$;

do $$ begin
  create policy "Admins manage the menus"
    on public.navigation_menus for all
    using (public.is_admin())
    with check (public.is_admin());
exception when duplicate_object then null; end; $$;

drop trigger if exists navigation_menus_set_updated_at on public.navigation_menus;
create trigger navigation_menus_set_updated_at
  before update on public.navigation_menus
  for each row execute function public.set_updated_at();
