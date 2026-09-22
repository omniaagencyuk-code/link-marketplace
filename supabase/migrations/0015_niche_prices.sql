-- ---------------------------------------------------------------------------
-- Per-niche prices
--
-- A publisher's rate is not one number. The same site that takes a technology
-- guest post for £450 will want £900 for gambling and may refuse CBD at any
-- price, and until now the marketplace could only state the £450 - so either
-- the regulated work was sold at a loss or the price was settled by email,
-- which is the thing this marketplace exists to avoid.
--
-- An override is keyed by niche AND placement type, because they move
-- independently: a gambling guest post and a gambling niche edit are different
-- pieces of work. A niche with no row is not free and not refused, it is
-- simply not priced differently: the service price stands.
--
-- Sell prices only. What we pay for a placement lives in `service_costs`,
-- which has no customer-readable policy at all, and that separation is the
-- only reason a cost cannot leak through a crafted embed. Nothing about our
-- margin belongs in a table the marketplace reads.
-- ---------------------------------------------------------------------------

create table public.website_niche_prices (
  website_id uuid not null references public.websites (id) on delete cascade,
  -- A slug from `lib/config/accepted-niches`. Text rather than an enum so the
  -- list can grow without a migration, matching `websites.accepted_niches`.
  niche text not null,
  link_type public.link_type not null,
  -- Zero is not a price. A placement given away is a decision someone makes
  -- per order, not a rate card entry, and storing it here would publish
  -- "Gambling £0" on the listing.
  price_minor integer not null check (price_minor > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  primary key (website_id, niche, link_type)
);

create index website_niche_prices_website_idx
  on public.website_niche_prices (website_id);

create trigger website_niche_prices_set_updated_at
  before update on public.website_niche_prices
  for each row execute function public.set_updated_at();

comment on table public.website_niche_prices is
  'Sell price overrides per niche and placement type. No row means the service price applies.';

-- ---------------------------------------------------------------------------
-- Policies
--
-- Read access matches `services` exactly: a price is only useful to someone
-- who can already see the listing it belongs to, and it must not be a way
-- around the marketplace gate. Signed-in users read; nobody signed out does.
-- ---------------------------------------------------------------------------
alter table public.website_niche_prices enable row level security;

create policy "Signed-in users read niche prices"
  on public.website_niche_prices for select
  to authenticated
  using (true);

create policy "Admins manage niche prices"
  on public.website_niche_prices for all
  using (public.is_admin()) with check (public.is_admin());
