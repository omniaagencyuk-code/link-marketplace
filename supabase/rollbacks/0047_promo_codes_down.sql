-- ---------------------------------------------------------------------------
-- Undo 0047.
--
-- DESTROYS: every promo code and the record of every discount given under
-- one. The orders survive and keep the amount that was taken off them, since
-- `discount_minor` is a column on `orders` - but the code that did it goes,
-- and with it the answer to "which campaign brought this order in".
--
-- The three columns on `orders` are dropped too, which is the part worth
-- pausing over: an order that was discounted will afterwards read as though
-- it was sold at a price nobody charged, because `total_minor` is the net
-- before any discount and `charged_minor` is what was taken. The two will no
-- longer be reconcilable from the row alone.
--
-- So take a dump of `promo_redemptions` and of `orders.discount_minor` before
-- running this if any code has ever been used.
--
-- The Stripe coupons are NOT removed. They live in the Stripe account and are
-- not this migration's to delete; nothing will reference them once the table
-- is gone, and a coupon with no code pointing at it cannot be applied by
-- anything in this application. Archive them in the Stripe dashboard if you
-- want them gone.
-- ---------------------------------------------------------------------------

alter table public.orders
  drop column if exists promo_code_id,
  drop column if exists promo_code,
  drop column if exists discount_minor;

drop table if exists public.promo_redemptions;
drop table if exists public.promo_codes;
