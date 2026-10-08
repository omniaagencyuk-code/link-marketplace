-- ---------------------------------------------------------------------------
-- Undo 0064.
--
-- DESTROYS: nothing. No table, no column, no row. It drops a view and a
-- function, both of which only read.
--
-- The cost is that the marketplace goes back to shipping every active listing
-- to the browser on every visit and filtering it there - 3,405 listings today,
-- and whatever the inventory is when this is run.
--
-- Only run it alongside 0063-era code. The current marketplace calls
-- `marketplace_search` and the page fails outright without it, which is the
-- safer of the two failures: it stops rather than quietly showing buyers a
-- different set of publishers than the filters claim.
-- ---------------------------------------------------------------------------

drop function if exists public.marketplace_search(
  text, text[], text[], text[], text[], text, integer, integer, integer,
  integer, integer, integer, integer, integer, integer, boolean, text, text,
  integer, integer
);
drop view if exists public.marketplace_listings;
