-- ---------------------------------------------------------------------------
-- Undo 0073.
--
-- DESTROYS: nothing. One function that only reads.
--
-- Every niche landing page fails outright against a missing function rather
-- than quietly showing the wrong sample or the wrong count. On a public page
-- quoting how many publishers cover a topic, that is the right failure.
--
-- Run it alongside 0072-era code, which paged through every active listing
-- with five embedded tables and filtered by niche in JavaScript to render six
-- rows - twenty-six sequential round trips at the current inventory, on pages
-- that are public and indexed.
-- ---------------------------------------------------------------------------

drop function if exists public.marketplace_niche_preview(text, integer);
