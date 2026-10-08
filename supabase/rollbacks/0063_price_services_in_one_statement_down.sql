-- ---------------------------------------------------------------------------
-- Undo 0063.
--
-- DESTROYS: nothing. No price is changed and no row is removed; this only
-- drops the function that writes service prices in one statement.
--
-- The cost of running it is that "Recalculate all prices" goes back to writing
-- one service at a time, ten in flight. Against 4,954 services that is 496
-- sequential waves - roughly fifty seconds before the niche prices and
-- calculations are even started - which is what timed the admin screen out and
-- left the inventory part priced: 3,479 services on the new rules and 1,475 on
-- the old ones.
--
-- So only run it alongside 0062-era code, which still has the per-row loop. The
-- current code calls this function and a recalculation will fail outright
-- without it, which is the safer of the two failures: it stops rather than
-- half-pricing the marketplace.
-- ---------------------------------------------------------------------------

drop function if exists public.pricing_apply_service_prices(jsonb);
