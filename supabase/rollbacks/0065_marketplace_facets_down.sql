-- ---------------------------------------------------------------------------
-- Undo 0065.
--
-- DESTROYS: nothing. It drops one function that only counts.
--
-- What it costs is the sidebar's counts. The marketplace no longer holds the
-- inventory, so it cannot count it: without this the niche counts, the
-- language list and the country list have no source, and the page fails rather
-- than silently offering filters that match nothing.
--
-- Drop it only alongside 0064's rollback and 0063-era code, which still filters
-- in the browser and counts there too.
-- ---------------------------------------------------------------------------

drop function if exists public.marketplace_facets(text);
