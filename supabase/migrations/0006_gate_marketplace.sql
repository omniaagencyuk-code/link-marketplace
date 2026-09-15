-- ---------------------------------------------------------------------------
-- Put the marketplace inventory behind an account
--
-- 0002 was written when the marketplace was public: it let anyone read active
-- websites, their categories and their services. Since the anon key ships in
-- the browser, those policies would expose the whole publisher list through
-- Supabase's REST API to anyone who asked for it - which would quietly undo
-- the access control the application enforces at every other layer.
--
-- Signed-in customers keep full read access. Signed-out visitors get nothing
-- from these tables; the public pages show a redacted preview built on the
-- server, which never contains a domain.
-- ---------------------------------------------------------------------------

drop policy if exists "Anyone can read active websites" on public.websites;
drop policy if exists "Anyone can read website categories" on public.website_categories;
drop policy if exists "Anyone can read services" on public.services;

create policy "Signed-in users read active websites"
  on public.websites for select
  to authenticated
  using (status = 'active' or public.is_admin());

create policy "Signed-in users read website categories"
  on public.website_categories for select
  to authenticated
  using (true);

create policy "Signed-in users read services"
  on public.services for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Aggregates for the public pages
--
-- The signed-out homepage and the marketplace gateway quote counts - websites,
-- niches, countries. Those are facts about the marketplace, not inventory, so
-- they are exposed through a security-definer function that returns numbers
-- only. It can never return a domain, because it does not select one.
-- ---------------------------------------------------------------------------
create or replace function public.marketplace_stats()
returns table (total_websites bigint, total_niches bigint, total_countries bigint)
language sql
stable
security definer set search_path = public
as $$
  select
    count(*) as total_websites,
    count(distinct primary_category_id) as total_niches,
    count(distinct country_code) as total_countries
  from public.websites
  where status = 'active';
$$;

grant execute on function public.marketplace_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Import history
--
-- Written by the bulk CSV importer. Admin-only in both directions - it records
-- who imported what and when.
-- ---------------------------------------------------------------------------
create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  total_rows integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  duplicate_mode text not null default 'skip',
  run_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists import_runs_created_idx on public.import_runs (created_at desc);

alter table public.import_runs enable row level security;

create policy "Admins manage import runs"
  on public.import_runs for all
  using (public.is_admin()) with check (public.is_admin());
