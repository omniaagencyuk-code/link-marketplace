-- ---------------------------------------------------------------------------
-- 0047  Promo codes
--
-- A code a buyer types at checkout, and the admin screen that creates them.
--
-- ## Why the codes are not simply Stripe's
--
-- Stripe has promotion codes of its own and a box on its hosted page to type
-- them into, which would have been one boolean. It is not used, for two
-- reasons. The rules we want - minimum spend, first order only, one per
-- customer - are not all rules Stripe expresses, and a code typed on Stripe's
-- page is a code this application never sees, so an order could not record
-- which campaign brought it in.
--
-- What *is* Stripe's is the arithmetic. Each code owns a Stripe coupon,
-- created once, and checkout hands Stripe the coupon rather than discounted
-- line items. Stripe then distributes a percentage across the lines, applies
-- VAT to the discounted figure, shows the buyer a discount row, and reports
-- what it actually took. A discount computed in this codebase would only ever
-- be a way to disagree with the amount charged.
--
-- ## Why this table is admin-only, with no customer policy at all
--
-- A read policy a customer matches is a list of every unexpired code in the
-- business. There is no such policy here, and no customer-facing one is safe
-- to add later: validation runs on the service role, server side, and the
-- only thing a buyer's browser ever learns is whether the one code they typed
-- works and what it takes off.
--
-- ## Redemptions are counted from rows, not from a counter
--
-- `promo_redemptions` holds one row per paid order, written by the webhook.
-- A denormalised `times_redeemed` column would have been cheaper to read and
-- would drift the first time an order was refunded or a webhook retried; the
-- usage limit is the thing standing between a leaked code and an unbounded
-- discount, so it is counted from the rows that prove a payment happened.
--
-- Crucially the row is written on payment, never when checkout opens. A code
-- limited to fifty redemptions must not be exhausted by fifty people who
-- opened Stripe and closed the tab.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),

  -- Stored exactly as it will be compared: upper case, no spaces. Normalising
  -- on the way in rather than on the way out means the unique index is doing
  -- the work, so 'SPRING25' and 'spring25' cannot both exist.
  code text not null unique check (code = upper(code) and code !~ '\s'),
  -- Shown only in the admin list, so whoever finds a code in six months can
  -- tell what it was for.
  description text not null default '',

  kind text not null check (kind in ('percent', 'fixed')),
  percent_off smallint check (percent_off is null or percent_off between 1 and 100),
  amount_off_minor integer check (amount_off_minor is null or amount_off_minor > 0),
  -- Required for a fixed amount and meaningless for a percentage: £50 off is
  -- a different offer in another currency, and Stripe refuses a fixed coupon
  -- against a session in a currency it was not created in.
  currency char(3),

  -- Every limit below is nullable, and null means no limit. That is the whole
  -- convention of this table: an empty box in the admin form is "no rule",
  -- never a zero.
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_per_customer integer check (max_per_customer is null or max_per_customer > 0),
  min_order_minor integer check (min_order_minor is null or min_order_minor > 0),
  -- For a code meant to win new customers rather than discount the regulars.
  first_order_only boolean not null default false,

  -- Switched off without being deleted, so the orders that used it keep
  -- pointing at something.
  active boolean not null default true,

  -- The Stripe coupon that does the arithmetic. Null means the code exists
  -- but Stripe has not been told about it yet - checkout refuses such a code
  -- rather than quietly charging full price.
  stripe_coupon_id text,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by text,

  -- Exactly one kind of discount, and the figure that goes with it. A row
  -- carrying both would be a code whose value depends on which column the
  -- reader happened to look at.
  constraint promo_codes_one_discount check (
    (kind = 'percent' and percent_off is not null and amount_off_minor is null)
    or (kind = 'fixed' and amount_off_minor is not null and percent_off is null and currency is not null)
  ),
  -- A window that has already closed before it opens is a code nobody can
  -- ever use, which is worth catching at the form rather than in support.
  constraint promo_codes_window_makes_sense check (
    starts_at is null or expires_at is null or expires_at > starts_at
  )
);

-- Validation looks a code up by its text on every attempt. The unique index
-- on `code` already serves that; this one is for the admin list.
create index if not exists promo_codes_active_idx on public.promo_codes (active, created_at desc);

-- ---------------------------------------------------------------------------
-- One row per paid order that used a code
-- ---------------------------------------------------------------------------
create table if not exists public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  -- The code goes, the redemption goes with it. The order keeps its own
  -- snapshot of what was taken off, so the money history survives either way.
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  -- Unique: one redemption per order, which is what makes the webhook safe to
  -- retry. Stripe delivers the same event twice as a matter of course.
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- What Stripe actually took off, read back from the session.
  discount_minor integer not null default 0 check (discount_minor >= 0),
  redeemed_at timestamptz not null default timezone('utc', now())
);

create index if not exists promo_redemptions_code_idx
  on public.promo_redemptions (promo_code_id);
-- The per-customer limit is this query.
create index if not exists promo_redemptions_code_user_idx
  on public.promo_redemptions (promo_code_id, user_id);

-- ---------------------------------------------------------------------------
-- What the order remembers
--
-- On `orders` rather than only in the redemption table because this is money
-- on an invoice: the code and the amount have to be readable from the order
-- itself, at the figure that applied on the day, even if the code is later
-- edited or deleted. `promo_code` is the snapshot; `promo_code_id` is the
-- link, and goes null if the code is ever removed.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists promo_code_id uuid references public.promo_codes (id) on delete set null,
  add column if not exists promo_code text,
  add column if not exists discount_minor integer
    check (discount_minor is null or discount_minor >= 0);

comment on column public.orders.discount_minor is
  'What the promo code took off. Written as an estimate when checkout opens, then overwritten with the figure Stripe reports having actually discounted.';

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Admin-only, through the service role, with no policy for anyone else. See
-- the note at the top: a customer-readable promo table is a published list of
-- every code in the business.
--
-- A buyer still sees their own discount, because it is on their order.
-- ---------------------------------------------------------------------------
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
