-- Undo 0088.
--
-- Destroys every edited menu. The header and footer do not break: with the
-- table gone the code falls back to `src/lib/config/navigation.ts`, which is
-- what a site with no rows renders anyway - so the visible cost is that the
-- navigation reverts to what ships, and anything an editor changed is gone.
--
-- Copy them out first if they are worth keeping:
--
--   select key, items from public.navigation_menus;
--
-- Safe to run before or after taking the code back: the reader treats a
-- missing table the same way it treats a missing row.

drop table if exists public.navigation_menus;
