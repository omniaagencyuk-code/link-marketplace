-- ---------------------------------------------------------------------------
-- Content ordering
--
-- Content is a standalone service: a customer can buy writing without buying a
-- placement, and vice versa. The two share a customer and a billing view but
-- nothing else, so they are modelled separately rather than overloading
-- `orders` with nullable placement columns.
-- ---------------------------------------------------------------------------

create type public.content_order_status as enum (
  'draft',
  'brief-received',
  'writing',
  'editing',
  'ready-for-review',
  'revision-requested',
  'complete',
  'cancelled'
);

create type public.content_type as enum (
  'seo-article',
  'blog-post',
  'guest-post',
  'landing-page',
  'website-copy',
  'other'
);

-- --------------------------------------------------------- content_orders --
create table public.content_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  customer_name text not null default '',
  customer_email text not null default '',
  status public.content_order_status not null default 'brief-received',
  total_minor integer not null default 0,
  currency text not null default 'GBP',
  placed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index content_orders_user_idx on public.content_orders (user_id);
create index content_orders_status_idx on public.content_orders (status);
create index content_orders_placed_idx on public.content_orders (placed_at desc);

create trigger content_orders_set_updated_at
  before update on public.content_orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------- content_order_items --
-- One article. The brief is stored as jsonb: it is a document the customer
-- writes once and the team reads, never something we query across, and its
-- shape will keep changing as the service grows.
create table public.content_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.content_orders (id) on delete cascade,
  reference text not null unique,
  brief jsonb not null default '{}'::jsonb,
  status public.content_order_status not null default 'brief-received',
  price_minor integer not null default 0,
  -- Internal only. Never selected into a customer-facing query.
  writer_name text,
  internal_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index content_order_items_order_idx on public.content_order_items (order_id);
create index content_order_items_status_idx on public.content_order_items (status);

create trigger content_order_items_set_updated_at
  before update on public.content_order_items
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------ revisions/messages --
create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_order_items (id) on delete cascade,
  notes text not null,
  requested_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create index content_revisions_item_idx on public.content_revisions (item_id);

create table public.content_messages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_order_items (id) on delete cascade,
  author_role text not null check (author_role in ('customer', 'team')),
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index content_messages_item_idx on public.content_messages (item_id, created_at);

create table public.content_deliveries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_order_items (id) on delete cascade,
  kind text not null check (kind in ('draft', 'final')),
  file_name text not null default '',
  -- Populated when the article was pasted rather than uploaded. A storage
  -- object path replaces this once Supabase storage is wired up.
  body text,
  storage_path text,
  delivered_at timestamptz not null default timezone('utc', now())
);

create index content_deliveries_item_idx on public.content_deliveries (item_id, delivered_at);

-- --------------------------------------------------------------------- RLS --
alter table public.content_orders enable row level security;
alter table public.content_order_items enable row level security;
alter table public.content_revisions enable row level security;
alter table public.content_messages enable row level security;
alter table public.content_deliveries enable row level security;

-- Does the current user own the order this item belongs to?
create or replace function public.owns_content_item(target_item uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.content_order_items item
    join public.content_orders ord on ord.id = item.order_id
    where item.id = target_item and ord.user_id = auth.uid()
  );
$$;

create policy "Customers read their own content orders"
  on public.content_orders for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Customers create their own content orders"
  on public.content_orders for insert
  with check (user_id = auth.uid());

create policy "Admins manage content orders"
  on public.content_orders for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Customers read their own articles"
  on public.content_order_items for select
  using (public.owns_content_item(id) or public.is_admin());

create policy "Admins manage articles"
  on public.content_order_items for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Customers read their own revisions"
  on public.content_revisions for select
  using (public.owns_content_item(item_id) or public.is_admin());

create policy "Customers request revisions on their own articles"
  on public.content_revisions for insert
  with check (public.owns_content_item(item_id));

create policy "Admins manage revisions"
  on public.content_revisions for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Customers read their own messages"
  on public.content_messages for select
  using (public.owns_content_item(item_id) or public.is_admin());

create policy "Customers post messages on their own articles"
  on public.content_messages for insert
  with check (public.owns_content_item(item_id) and author_role = 'customer');

create policy "Admins manage messages"
  on public.content_messages for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Customers read their own deliveries"
  on public.content_deliveries for select
  using (public.owns_content_item(item_id) or public.is_admin());

-- Only the team delivers content.
create policy "Admins manage deliveries"
  on public.content_deliveries for all
  using (public.is_admin()) with check (public.is_admin());
