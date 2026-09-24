-- ---------------------------------------------------------------------------
-- What the customer was actually charged
--
-- `total_minor` is the sum of the placement prices: the net. Press Parrot is
-- VAT registered, so a UK customer pays that plus 20%, and until now the
-- order had nowhere to record the difference. An order saying 180 when 216
-- left the customer's account is wrong on the dashboard, wrong in an export,
-- and wrong in any reconciliation against Stripe.
--
-- Both are filled in from the Stripe session when the payment lands, never
-- computed here. Stripe decides the rate - it knows the billing address and
-- whether a valid VAT number made it a reverse charge - and a second opinion
-- calculated in this codebase would only ever be a way to disagree with the
-- amount that was really taken.
--
-- Nullable, because an unpaid draft order has no answer yet and orders placed
-- before this existed never will.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists tax_minor integer check (tax_minor is null or tax_minor >= 0);

alter table public.orders
  add column if not exists charged_minor integer check (charged_minor is null or charged_minor >= 0);

comment on column public.orders.tax_minor is
  'VAT charged, from Stripe. Null when unpaid or placed before VAT was handled.';

comment on column public.orders.charged_minor is
  'What Stripe actually took: total_minor plus tax_minor. Null when unpaid.';
