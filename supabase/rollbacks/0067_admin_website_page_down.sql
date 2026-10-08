-- ---------------------------------------------------------------------------
-- Undo 0067.
--
-- DESTROYS: nothing. Two functions that only read, no table, no column, no
-- row.
--
-- What it costs is `/admin/websites`. The current table asks the database for
-- one page and for the ids a filter matches; without these it fails outright
-- rather than quietly showing a different set of listings than the filters
-- claim - which is the safer failure for a screen people change prices from.
--
-- To go back properly, run this alongside 0066-era code: that version of the
-- page read every non-archived listing with costs, contacts and commercials
-- joined on and priced all of them to render fifty rows, which is about a
-- minute to open and twenty-three sequential round trips before any of it was
-- mapped.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_website_ids(text, text);
drop function if exists public.admin_website_page(text, text, integer, integer);
