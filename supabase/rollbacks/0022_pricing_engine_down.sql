-- ---------------------------------------------------------------------------
-- Undo 0022: the pricing engine
--
-- REMOVED, with their data: fx_rates, pricing_rules, pricing_bands,
-- pricing_rounding, price_calculations. The rules you tuned and every stored
-- breakdown go with them.
--
-- KEPT: the sell prices themselves. They live in `services.price_minor` and
-- `website_niche_prices.price_minor`, which existed long before this and are
-- what the marketplace charges. Backing the engine out stops prices being
-- recalculated; it does not un-price the inventory.
--
-- The agency prices and the override flags are dropped, so every listing
-- reverts to one price for everyone and no memory of which were set by hand.
-- Note what that means before running it: an override is only distinguishable
-- from a calculated price by that flag.
-- ---------------------------------------------------------------------------

drop table if exists public.price_calculations cascade;

drop table if exists public.pricing_rounding cascade;

drop table if exists public.pricing_bands cascade;

drop table if exists public.pricing_rules cascade;

drop table if exists public.fx_rates cascade;

alter table public.website_commercials drop column if exists vat_rate_pct;

alter table public.services drop column if exists price_override;
alter table public.services drop column if exists agency_price_minor;

alter table public.website_niche_prices drop column if exists price_override;
alter table public.website_niche_prices drop column if exists agency_price_minor;
