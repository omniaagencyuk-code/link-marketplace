-- ---------------------------------------------------------------------------
-- Undo 0072.
--
-- DESTROYS: nothing. It restores 0064's `marketplace_search` and drops the
-- per-listing helper.
--
-- What it restores with it is the outage. 0064 priced every placement in the
-- marketplace before filtering anything, which measured 11.7 seconds for the
-- first page against 12,629 active listings and timed out in production. Only
-- run this against an inventory small enough for that - a few thousand active
-- listings - and know that the cost grows as listings times placements.
--
-- There is no copy of 0064's body here on purpose: re-run
-- `0064_marketplace_search_in_sql.sql` to get it, which is the file that
-- actually holds it rather than a transcription that can drift from it.
-- ---------------------------------------------------------------------------

drop function if exists public.marketplace_placements(uuid, text, text[], integer, integer);
