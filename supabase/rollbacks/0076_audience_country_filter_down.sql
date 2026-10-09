-- ---------------------------------------------------------------------------
-- Undo 0076.
--
-- DESTROYS: nothing. One view column and three function arguments, all of
-- them read-only. `websites.audience_split` is untouched - this only stopped
-- exposing it through the view.
--
-- Re-run `0072_marketplace_search_per_listing.sql` after this to put the
-- previous `marketplace_search` back, and `0064_marketplace_search_in_sql.sql`
-- for the view without `audience_split`. Dropping the function without
-- restoring one leaves the marketplace unable to search at all, which is the
-- safer failure but still a failure.
--
-- The cost is the country-traffic filter: a customer can narrow by where a
-- publisher is but not by where its readers are. Nothing else changes, and
-- the column still draws in each row because that reads the listing rather
-- than the view.
-- ---------------------------------------------------------------------------

drop function if exists public.marketplace_search(
  text, text[], text[], text, integer, integer, text[], text[], text, integer,
  integer, integer, integer, integer, integer, integer, integer, integer,
  boolean, text, text, integer, integer
);
