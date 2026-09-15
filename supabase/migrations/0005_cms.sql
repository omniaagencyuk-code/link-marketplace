-- ---------------------------------------------------------------------------
-- Editable page content and the blog
--
-- Page content is stored as one row per page holding a jsonb tree of
-- overrides. It is deliberately not a table of individual fields: the shipped
-- defaults live in code, a saved row is only the difference from them, and the
-- application rebuilds the tree against a declared schema on every write. A
-- normalised field table would buy query-ability nobody needs and cost a
-- migration every time a page gains a field.
-- ---------------------------------------------------------------------------

create table public.page_content (
  -- The page's slug, e.g. "home" or "guest-posts". Matches the CMS registry.
  slug text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create trigger page_content_set_updated_at
  before update on public.page_content
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------- blog --
create type public.post_status as enum ('draft', 'scheduled', 'published');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  -- Markdown. Rendered by a restricted renderer that produces React nodes
  -- rather than HTML, so stored content can never become markup.
  body text not null default '',
  category text not null default 'link-building',
  status public.post_status not null default 'draft',
  author text not null default '',
  cover_image_src text,
  cover_image_alt text,
  seo_title text,
  seo_description text,
  -- A future value with status 'scheduled' keeps the post private until then.
  published_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create index posts_status_published_idx on public.posts (status, published_at desc);
create index posts_category_idx on public.posts (category);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------- RLS --
alter table public.page_content enable row level security;
alter table public.posts enable row level security;

-- Page copy is what the public site renders, so it is readable by anyone.
-- Only the team writes it.
create policy "Anyone can read page content"
  on public.page_content for select using (true);

create policy "Admins manage page content"
  on public.page_content for all
  using (public.is_admin()) with check (public.is_admin());

-- A draft, or a scheduled post whose date has not arrived, is invisible to
-- everyone but the team. Enforcing that here rather than only in the
-- application means an unpublished post cannot leak through a query that
-- forgets a filter.
create policy "Anyone can read live posts"
  on public.posts for select
  using (
    public.is_admin()
    or (status = 'published')
    or (status = 'scheduled' and published_at <= timezone('utc', now()))
  );

create policy "Admins manage posts"
  on public.posts for all
  using (public.is_admin()) with check (public.is_admin());
