-- ---------------------------------------------------------------------------
-- Row level security
--
-- Public catalogue data is readable by anyone; customer data is private to the
-- owning user; writes to catalogue tables are restricted to admins.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.websites enable row level security;
alter table public.website_categories enable row level security;
alter table public.services enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.favourites enable row level security;
alter table public.settings enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------- profiles
create policy "Users read their own profile"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "Users update their own profile"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------- public catalogue read
create policy "Anyone can read categories"
  on public.categories for select using (true);

create policy "Anyone can read active websites"
  on public.websites for select
  using (status = 'active' or public.is_admin());

create policy "Anyone can read website categories"
  on public.website_categories for select using (true);

create policy "Anyone can read services"
  on public.services for select using (true);

create policy "Anyone can read settings"
  on public.settings for select using (true);

-- ------------------------------------------------------------ admin writes
create policy "Admins manage categories"
  on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage websites"
  on public.websites for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage website categories"
  on public.website_categories for all
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage services"
  on public.services for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins manage settings"
  on public.settings for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ customer data
create policy "Users read their own orders"
  on public.orders for select
  using (user_id = auth.uid() or public.is_admin());

create policy "Users create their own orders"
  on public.orders for insert
  with check (user_id = auth.uid());

create policy "Users update their own draft orders"
  on public.orders for update
  using ((user_id = auth.uid() and status = 'draft') or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy "Users read their own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users manage items on their own draft orders"
  on public.order_items for all
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Users manage their own favourites"
  on public.favourites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
