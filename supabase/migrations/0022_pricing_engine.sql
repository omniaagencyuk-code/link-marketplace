-- ---------------------------------------------------------------------------
-- Working sell prices out from publisher costs
--
-- Costs arrive in the publisher's currency, on their payment terms, with
-- their VAT position. A sell price is that cost brought into GBP, loaded with
-- what it actually costs us to pay them, marked up, and rounded to something
-- a buyer will read as a price rather than as arithmetic.
--
-- Every number in the calculation is a row here rather than a constant in the
-- code, because all of them are commercial decisions that will change - and a
-- margin band that needs a deploy to adjust is a margin band nobody adjusts.
--
-- The calculated prices land in `services` and `website_niche_prices`, which
-- customers already read. The workings land in `price_calculations`, which
-- they cannot: the breakdown contains the cost.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- fx rates --
-- One row per currency, holding what we will price at. Refreshed daily by a
-- cron job and read from here at calculation time, so a pricing run never
-- depends on a third party being up - and two runs on the same day cannot
-- disagree because the rate moved between them.
create table if not exists public.fx_rates (
  currency char(3) primary key,
  -- One unit of `currency` in GBP. EUR 1.00 -> 0.84 means rate_to_gbp = 0.84.
  rate_to_gbp numeric(18, 8) not null check (rate_to_gbp > 0),
  -- Kept so "has this moved more than 2%?" is a subtraction rather than a
  -- second table and a window function.
  previous_rate_to_gbp numeric(18, 8) check (previous_rate_to_gbp > 0),
  source text not null default 'frankfurter.app',
  fetched_at timestamptz not null default timezone('utc', now())
);

comment on table public.fx_rates is
  'Exchange rates used for pricing. Internal - no customer-facing policy exists.';

alter table public.fx_rates enable row level security;

do $$
begin
  create policy "Admins manage fx rates"
    on public.fx_rates for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

-- GBP against itself, so a British publisher needs no special case anywhere.
insert into public.fx_rates (currency, rate_to_gbp, source)
values ('GBP', 1, 'fixed')
on conflict (currency) do nothing;

-- ---------------------------------------------------------- pricing rules --
create table if not exists public.pricing_rules (
  id smallint primary key default 1 check (id = 1),

  -- Added to every conversion. Rates move between the daily fetch and the
  -- day we actually pay the publisher, and the buffer is what stops a
  -- fortnight of drift eating a thin margin.
  fx_buffer_pct numeric(6, 3) not null default 4 check (fx_buffer_pct >= 0),

  -- What it costs to get money to a publisher, by method.
  paypal_fee_pct numeric(6, 3) not null default 4 check (paypal_fee_pct >= 0),
  paypal_fee_fixed_minor integer not null default 30 check (paypal_fee_fixed_minor >= 0),
  crypto_fee_pct numeric(6, 3) not null default 1 check (crypto_fee_pct >= 0),
  bank_fee_pct numeric(6, 3) not null default 0 check (bank_fee_pct >= 0),
  bank_fee_fixed_minor integer not null default 0 check (bank_fee_fixed_minor >= 0),

  -- Off until an accountant says otherwise. While it is off, VAT a publisher
  -- charges us is a real cost and is priced in; turning it on says we get it
  -- back and it should not be.
  vat_reclaimable boolean not null default false,

  -- No placement is worth selling for less than this over its true cost,
  -- whatever the percentage bands work out to.
  min_margin_minor integer not null default 4000 check (min_margin_minor >= 0),

  -- What an agency account comes off the markup percentage - points, not a
  -- discount on the price. 60% becomes 50%, and the minimum margin still
  -- applies underneath.
  agency_discount_points numeric(6, 3) not null default 10 check (agency_discount_points >= 0),

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.pricing_rules (id) values (1) on conflict (id) do nothing;

alter table public.pricing_rules enable row level security;

do $$
begin
  create policy "Admins manage pricing rules"
    on public.pricing_rules for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger pricing_rules_set_updated_at
    before update on public.pricing_rules
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ----------------------------------------------------------- markup bands --
-- A table rather than a column of JSON: these are edited, and a band with its
-- own row can be validated, ordered and reasoned about in SQL.
create table if not exists public.pricing_bands (
  id uuid primary key default gen_random_uuid(),
  -- True cost in GBP minor units that this band starts at. The band runs to
  -- the next band's floor, so they cannot overlap or leave a gap.
  min_cost_minor integer not null unique check (min_cost_minor >= 0),
  -- Exactly one of these. A flat addition for cheap placements, where a
  -- percentage would earn pennies; a percentage above that.
  markup_pct numeric(6, 3) check (markup_pct >= 0),
  flat_minor integer check (flat_minor >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pricing_bands_one_kind check (
    (markup_pct is not null and flat_minor is null)
    or (markup_pct is null and flat_minor is not null)
  )
);

alter table public.pricing_bands enable row level security;

do $$
begin
  create policy "Admins manage pricing bands"
    on public.pricing_bands for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

insert into public.pricing_bands (min_cost_minor, markup_pct, flat_minor) values
  (0, null, 4000),
  (5000, 60, null),
  (15000, 40, null),
  (40000, 30, null)
on conflict (min_cost_minor) do nothing;

-- -------------------------------------------------------------- rounding --
-- What a price is allowed to end in. Rounding is always upward: a price that
-- rounded down would quietly sell below the margin the bands just worked out.
create table if not exists public.pricing_rounding (
  id uuid primary key default gen_random_uuid(),
  min_minor integer not null unique check (min_minor >= 0),
  -- Allowed final digits of the pound figure. {5,9} gives 95, 99, 149, 195;
  -- {9} alone gives 1299.
  allowed_last_digits smallint[] not null check (array_length(allowed_last_digits, 1) > 0),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.pricing_rounding enable row level security;

do $$
begin
  create policy "Admins manage rounding"
    on public.pricing_rounding for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

insert into public.pricing_rounding (min_minor, allowed_last_digits) values
  (0, '{5,9}'),
  (10000, '{5,9}'),
  (100000, '{9}')
on conflict (min_minor) do nothing;

-- --------------------------------------------------- the publisher's VAT --
alter table public.website_commercials
  add column if not exists vat_rate_pct numeric(6, 3)
    check (vat_rate_pct is null or (vat_rate_pct >= 0 and vat_rate_pct <= 100));

comment on column public.website_commercials.vat_rate_pct is
  'VAT the publisher adds to their price, where they charge it. 25 for a Danish publisher with no EU VAT number.';

-- ------------------------------------------------------ calculated prices --
-- The workings, kept so a price can be explained a year later and so a
-- reviewer can see where a thin margin came from. Admin only: it holds cost.
create table if not exists public.price_calculations (
  website_id uuid not null references public.websites (id) on delete cascade,
  link_type public.link_type not null,
  -- '' for the general rate. A niche slug otherwise. Not null so it can sit
  -- in the primary key without a coalesce.
  niche text not null default '',

  cost_minor integer not null,
  currency char(3) not null,
  fx_rate numeric(18, 8) not null,
  fx_buffer_pct numeric(6, 3) not null,
  cost_gbp_minor integer not null,
  fee_minor integer not null,
  vat_minor integer not null,
  true_cost_minor integer not null,
  band_label text not null,
  markup_minor integer not null,
  unrounded_minor integer not null,
  sell_minor integer not null,
  agency_minor integer not null,
  margin_minor integer not null,
  calculated_at timestamptz not null default timezone('utc', now()),

  primary key (website_id, link_type, niche)
);

comment on table public.price_calculations is
  'How each sell price was arrived at. Internal only - it contains the cost.';

create index if not exists price_calculations_margin_idx on public.price_calculations (margin_minor);

alter table public.price_calculations enable row level security;

do $$
begin
  create policy "Admins manage price calculations"
    on public.price_calculations for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------- the prices customers actually see --
-- An override is a price somebody typed. Recalculation leaves it alone, and
-- the margin report checks it still clears the minimum after a cost moves.
alter table public.services
  add column if not exists price_override boolean not null default false;

alter table public.services
  add column if not exists agency_price_minor integer
    check (agency_price_minor is null or agency_price_minor >= 0);

alter table public.website_niche_prices
  add column if not exists price_override boolean not null default false;

alter table public.website_niche_prices
  add column if not exists agency_price_minor integer
    check (agency_price_minor is null or agency_price_minor >= 0);

comment on column public.services.price_override is
  'Set by hand. Recalculation never changes it.';
