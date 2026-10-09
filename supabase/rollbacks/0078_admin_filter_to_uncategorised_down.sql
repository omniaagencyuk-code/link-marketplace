-- ---------------------------------------------------------------------------
-- Undo 0078.
--
-- DESTROYS: nothing. Two read-only functions, one argument each. No column,
-- row or category assignment is touched either way.
--
-- Re-run `0068_admin_website_ids_in_pages.sql` and then
-- `0067_admin_website_page.sql` to put the previous definitions back. Order
-- matters only in that 0067 also defines a two-argument `admin_website_ids`
-- which 0068 drops - running 0067 last would leave that overload behind, and
-- an overload differing only by defaults makes every named call ambiguous,
-- which is the bug 0068 exists to fix.
--
-- Drop first, because these signatures differ from the old ones and a
-- `create or replace` cannot narrow an argument list.
--
-- ## What going back costs
--
-- The admin table loses "Not categorised". The 1,840 active listings with no
-- primary category - one in seven when this was written - become findable
-- only one row at a time, which is the state 0077 left them in. Nothing
-- breaks; the backlog just stops being workable.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_website_page(text, text, boolean, integer, integer);
drop function if exists public.admin_website_ids(text, text, boolean, integer, integer);

-- Now re-run 0068 and then 0067, as above.
