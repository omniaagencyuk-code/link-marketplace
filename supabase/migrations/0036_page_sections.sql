-- ---------------------------------------------------------------------------
-- 0036  Pages get a shape that is data rather than code
--
-- A page's sections are currently a TypeScript literal: `definition.sections`
-- in the CMS registry. The admin editor renders exactly those sections, in
-- exactly that order, because the order is source code. Adding a section to a
-- page is a deploy, and reordering one is a diff.
--
-- These two tables move that shape into the database, where an administrator
-- can reach it. Nothing here replaces `page_content` or `custom_pages` - they
-- keep holding what they hold, and a page with no rows in `page_sections`
-- renders exactly as it does today. That fallback is the migration plan: a
-- page moves over when its rows exist and have been checked against the
-- current render, not when this migration runs.
--
-- Both tables are additive. Running this changes nothing anybody can see.
--
-- Written to survive being run twice, because these get pasted into the
-- Supabase SQL editor by hand and one that half-applies has to be safe to
-- retry. That is why the creates are guarded and the policies, triggers and
-- the deferrable constraint are dropped before they are made: Postgres has no
-- "create policy if not exists".
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- global ------
--
-- A section saved once and used on many pages: the signup call to action, the
-- trust bar, the agency pitch. A page's row points at one of these instead of
-- carrying its own copy, so editing it here changes every page using it.
--
-- Deliberately a plain table rather than a join: a section is either its own
-- or a reference to one of these, and "detach from global" copies the values
-- down and forgets the id. That is the whole model.
create table if not exists public.global_sections (
  id uuid primary key default gen_random_uuid(),
  -- What an administrator calls it in the list: "Main signup CTA".
  name text not null,
  -- A key in the component registry. Not a foreign key: the registry lives in
  -- code, and a row naming a component that no longer exists is skipped by
  -- the renderer rather than being a broken page.
  component text not null,
  variant text not null default 'default',
  values jsonb not null default '{}'::jsonb,
  animation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,

  constraint global_sections_name_length check (char_length(name) between 1 and 120),
  constraint global_sections_component_length check (char_length(component) between 1 and 60),
  constraint global_sections_variant_length check (char_length(variant) between 1 and 60),
  -- jsonb accepts a bare string or a number as a valid document. Every reader
  -- of these columns expects an object, so the column says so.
  constraint global_sections_values_object check (jsonb_typeof(values) = 'object'),
  constraint global_sections_animation_object check (jsonb_typeof(animation) = 'object')
);

drop trigger if exists global_sections_set_updated_at on public.global_sections;

create trigger global_sections_set_updated_at
  before update on public.global_sections
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- page -------
create table if not exists public.page_sections (
  id uuid primary key default gen_random_uuid(),

  -- 'home', 'gambling-link-building', or any custom page's slug. Not a
  -- foreign key, because it addresses two different tables: pages registered
  -- in code have no row anywhere, and pages created in the admin live in
  -- custom_pages. A constraint here would have to know which, and would be
  -- wrong the first time a page moved between them.
  page_slug text not null,

  component text not null,
  variant text not null default 'default',

  -- Where it sits. Gaps are fine; the renderer orders rather than indexes.
  position integer not null default 0,

  -- Hidden is not deleted: a section an administrator has switched off keeps
  -- its content, so switching it back on does not mean typing it again.
  hidden boolean not null default false,

  -- A locked section cannot be deleted or moved. Its content, images, links
  -- and animation stay editable - a locked hero is still a hero somebody
  -- writes. Enforced in the application; recorded here so the lock survives
  -- a page being duplicated.
  locked boolean not null default false,

  -- {entrance, speed, delay}, each one of a fixed set the registry names.
  -- Never a duration, an easing curve or a pixel value: an administrator
  -- picks from a list, and the design system owns what the list means.
  animation jsonb not null default '{}'::jsonb,

  -- The section's own fields, shaped by its component's schema and rebuilt
  -- through that schema's whitelist on every save. An admin screen is not a
  -- reason to trust what arrives at the database.
  values jsonb not null default '{}'::jsonb,

  -- Set means this row is a reference: the global's values are what renders.
  -- Null means the row is its own. Deleting a global detaches rather than
  -- deleting pages, which is what `on delete set null` buys.
  global_id uuid references public.global_sections(id) on delete set null,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,

  constraint page_sections_slug_format check (page_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint page_sections_component_length check (char_length(component) between 1 and 60),
  constraint page_sections_variant_length check (char_length(variant) between 1 and 60),
  constraint page_sections_position_positive check (position >= 0),
  constraint page_sections_values_object check (jsonb_typeof(values) = 'object'),
  constraint page_sections_animation_object check (jsonb_typeof(animation) = 'object')
);

-- One page's sections, in order, in one query. The whole read path.
create index if not exists page_sections_page_idx on public.page_sections (page_slug, position);

-- Which pages use a global, for the "this appears on 4 pages" warning the
-- editor shows before somebody changes one.
create index if not exists page_sections_global_idx on public.page_sections (global_id)
  where global_id is not null;

-- Two sections cannot share a position on a page.
--
-- Deferrable on purpose. Reordering swaps positions, and a unique index that
-- is checked per row rejects the swap halfway through - the first row moves
-- onto the second's number before the second has vacated it. Deferred to the
-- end of the statement, a single renumbering UPDATE is checked once, when the
-- new order is complete and consistent.
alter table public.page_sections drop constraint if exists page_sections_position_unique;

alter table public.page_sections
  add constraint page_sections_position_unique unique (page_slug, position)
  deferrable initially immediate;

drop trigger if exists page_sections_set_updated_at on public.page_sections;

create trigger page_sections_set_updated_at
  before update on public.page_sections
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- RLS -------
alter table public.page_sections enable row level security;
alter table public.global_sections enable row level security;

-- A section of a published page is public copy, like everything else the CMS
-- holds. Two things keep a draft out:
--
--   - hidden rows are not public, and
--   - a page that exists in custom_pages and is not published is a draft, so
--     its sections are not public either.
--
-- Stated as "unless there is an unpublished custom page at this slug" so that
-- pages registered in code - which have no row in custom_pages at all and are
-- always published - pass without a special case.
--
-- The application filters both of these too. This is the backstop that keeps
-- a query which forgets from leaking a draft.
-- Whether a slug names a page that has been created in the admin and not yet
-- published. Security definer, and that is the entire point of it.
--
-- Written inline in the policy below, the subquery reads custom_pages as
-- whoever is asking - and a stranger cannot see an unpublished page, because
-- custom_pages has a policy of its own saying so. So "no unpublished page
-- exists at this slug" came back true for exactly the drafts it was meant to
-- catch, and their sections were public. The test caught it; nothing about
-- reading the policy would have.
--
-- Running as the owner, it sees every row and answers the question that was
-- actually being asked.
create or replace function public.page_is_draft(slug text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.custom_pages page
    where page.slug = page_is_draft.slug and not page.published
  );
$$;

drop policy if exists "Anyone can read sections of published pages" on public.page_sections;

create policy "Anyone can read sections of published pages"
  on public.page_sections for select
  using (
    public.is_admin()
    or (not hidden and not public.page_is_draft(page_slug))
  );

drop policy if exists "Admins manage page sections" on public.page_sections;

create policy "Admins manage page sections"
  on public.page_sections for all
  using (public.is_admin()) with check (public.is_admin());

-- A global section is rendered on public pages, so it is public copy. Whether
-- it appears anywhere is decided by the page_sections row that points at it,
-- which has its own policy above.
drop policy if exists "Anyone can read global sections" on public.global_sections;

create policy "Anyone can read global sections"
  on public.global_sections for select
  using (true);

drop policy if exists "Admins manage global sections" on public.global_sections;

create policy "Admins manage global sections"
  on public.global_sections for all
  using (public.is_admin()) with check (public.is_admin());

comment on table public.page_sections is
  'A page''s shape: which components, in what order, with what content. No rows means the page renders from code.';

comment on table public.global_sections is
  'A section used on several pages. A page_sections row with global_id set renders this instead of its own values.';
