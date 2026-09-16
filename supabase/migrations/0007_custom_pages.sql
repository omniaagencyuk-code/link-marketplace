-- ---------------------------------------------------------------------------
-- Pages created from the admin
--
-- A custom page is the same object as a built-in service page - same schema,
-- same editor, same layout - except that its identity lives here rather than
-- in a code module. It stores its own label and description alongside the
-- jsonb tree of content, because unlike a built-in page there is no module to
-- fall back to for those.
--
-- `values` follows the same rule as page_content: it is overrides on top of
-- generated defaults, rebuilt field by field against the declared schema on
-- every write, never trusted as it arrives.
-- ---------------------------------------------------------------------------

create table public.custom_pages (
  -- The URL segment. The page is served at "/" || slug, so this is unique by
  -- definition and makes a natural primary key.
  slug text primary key,
  label text not null,
  description text not null default '',
  -- Draft pages are invisible to the public, including in the sitemap.
  published boolean not null default false,
  values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,

  -- The application validates the slug before it gets here; this is the
  -- backstop that keeps a direct database write from creating a page at a URL
  -- the router cannot serve.
  constraint custom_pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint custom_pages_slug_length check (char_length(slug) between 2 and 60)
);

create index custom_pages_published_idx on public.custom_pages (published, updated_at desc);

create trigger custom_pages_set_updated_at
  before update on public.custom_pages
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------- RLS --
alter table public.custom_pages enable row level security;

-- A published page is public copy, exactly like page_content. An unpublished
-- one is a draft, and enforcing that here rather than only in the application
-- means a query that forgets the filter still cannot leak it.
create policy "Anyone can read published custom pages"
  on public.custom_pages for select
  using (published or public.is_admin());

create policy "Admins manage custom pages"
  on public.custom_pages for all
  using (public.is_admin()) with check (public.is_admin());
