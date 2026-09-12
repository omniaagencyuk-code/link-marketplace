-- ---------------------------------------------------------------------------
-- Press Parrot initial schema
--
-- Apply with the Supabase CLI (`supabase db push`) or by pasting into the SQL
-- editor in the Supabase dashboard. See supabase/README.md.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- Shared trigger that keeps updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ------------------------------------------------------------------ enums --
create type public.user_role as enum ('customer', 'admin');
create type public.website_status as enum ('draft', 'active', 'paused', 'archived');
create type public.link_type as enum ('guest-post', 'niche-edit', 'digital-pr');
create type public.link_attribute as enum ('dofollow', 'nofollow');
create type public.sponsored_tag_policy as enum ('never', 'on-request', 'always');
create type public.order_status as enum (
  'draft',
  'awaiting-content',
  'in-progress',
  'submitted',
  'live',
  'cancelled'
);

-- --------------------------------------------------------------- profiles --
-- One row per auth.users record. Created by the handle_new_user trigger below.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  company text,
  role public.user_role not null default 'customer',
  plan text not null default 'starter',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- categories --
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  position integer not null default 0,
  featured boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index categories_position_idx on public.categories (position);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- websites --
create table public.websites (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  domain text not null unique,
  title text not null,
  description text not null default '',
  overview text not null default '',
  primary_category_id uuid references public.categories (id) on delete set null,
  country_code char(2) not null,
  language_code text not null default 'en',
  status public.website_status not null default 'draft',
  verified boolean not null default false,
  rating numeric(2, 1) not null default 0,
  completed_orders integer not null default 0,

  -- metrics
  domain_rating smallint not null default 0,
  organic_traffic integer not null default 0,
  referring_domains integer not null default 0,
  traffic_trend integer[] not null default '{}',
  traffic_change_pct numeric(5, 1) not null default 0,
  top_country_share smallint not null default 0,
  audience_split jsonb not null default '[]'::jsonb,
  spam_score smallint not null default 0,

  -- publishing rules
  min_word_count integer not null default 800,
  max_word_count integer not null default 2000,
  max_links smallint not null default 1,
  link_attribute public.link_attribute not null default 'dofollow',
  sponsored_tag public.sponsored_tag_policy not null default 'never',
  accepts_gambling boolean not null default false,
  accepts_finance boolean not null default false,
  accepts_crypto boolean not null default false,
  accepts_cbd boolean not null default false,
  accepts_adult boolean not null default false,
  restricted_niches text[] not null default '{}',
  content_provided_by text not null default 'either',
  guidelines text[] not null default '{}',
  example_placements jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes matching the marketplace filters and sorts.
create index websites_status_idx on public.websites (status);
create index websites_category_idx on public.websites (primary_category_id);
create index websites_country_idx on public.websites (country_code);
create index websites_language_idx on public.websites (language_code);
create index websites_domain_rating_idx on public.websites (domain_rating desc);
create index websites_traffic_idx on public.websites (organic_traffic desc);
create index websites_referring_domains_idx on public.websites (referring_domains desc);
create index websites_created_at_idx on public.websites (created_at desc);

-- Full text search over domain, title and description.
create index websites_search_idx on public.websites
  using gin (to_tsvector('english', domain || ' ' || title || ' ' || description));

create trigger websites_set_updated_at
  before update on public.websites
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- website_categories --
-- Secondary niches. The primary niche stays on websites.primary_category_id.
create table public.website_categories (
  website_id uuid not null references public.websites (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (website_id, category_id)
);

create index website_categories_category_idx on public.website_categories (category_id);

-- --------------------------------------------------------------- services --
create table public.services (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete cascade,
  type public.link_type not null,
  price_minor integer not null check (price_minor >= 0),
  turnaround_min_days smallint not null default 1,
  turnaround_max_days smallint not null default 5,
  available boolean not null default true,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (website_id, type)
);

create index services_website_idx on public.services (website_id);
create index services_price_idx on public.services (price_minor);
create index services_type_idx on public.services (type);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------- orders --
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.order_status not null default 'draft',
  total_minor integer not null default 0,
  currency char(3) not null default 'GBP',
  placed_at timestamptz not null default timezone('utc', now()),
  expected_live_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index orders_user_idx on public.orders (user_id);
create index orders_status_idx on public.orders (status);
create index orders_placed_at_idx on public.orders (placed_at desc);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ order_items --
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  website_id uuid not null references public.websites (id) on delete restrict,
  service_id uuid references public.services (id) on delete set null,
  service_type public.link_type not null,
  price_minor integer not null check (price_minor >= 0),
  target_url text not null,
  anchor_text text not null default '',
  preferred_landing_page text,
  notes text,
  live_url text,
  status public.order_status not null default 'draft',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_website_idx on public.order_items (website_id);
create index order_items_status_idx on public.order_items (status);

create trigger order_items_set_updated_at
  before update on public.order_items
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- favourites --
create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  website_id uuid not null references public.websites (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, website_id)
);

create index favourites_user_idx on public.favourites (user_id);

-- --------------------------------------------------------------- settings --
-- Single-row table holding editable marketplace settings.
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null default 'Press Parrot',
  support_email text not null default 'support@pressparrot.com',
  sales_email text not null default 'sales@pressparrot.com',
  primary_colour text not null default '#0B1B2B',
  accent_colour text not null default '#10B981',
  currency char(3) not null default 'GBP',
  locale text not null default 'en-GB',
  default_page_size smallint not null default 25,
  default_sort text not null default 'relevance',
  enabled_link_types public.link_type[] not null default
    '{guest-post,niche-edit,digital-pr}'::public.link_type[],
  margin_pct smallint not null default 20,
  order_statuses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- new user handler --
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
