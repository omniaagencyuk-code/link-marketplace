-- ---------------------------------------------------------------------------
-- Undo 0093  Counting a niche without downloading the inventory to do it
--
-- Drops the counting function. Nothing is lost: it stores nothing and derives
-- everything from `marketplace_listings` on each call.
--
-- Run it alongside 0092-era code. Current code calls this function to decide
-- which niches have a page, so dropping it without reverting the code puts
-- /guest-posts back to reading every active listing to count them - which is
-- the statement timeout this migration exists to remove, not a safe fallback.
-- ---------------------------------------------------------------------------

drop function if exists public.niche_page_counts();
