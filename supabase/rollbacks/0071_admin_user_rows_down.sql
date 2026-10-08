-- ---------------------------------------------------------------------------
-- Undo 0071.
--
-- DESTROYS: nothing. One function that only counts.
--
-- The cost is `/admin/users`, which fails outright rather than quietly
-- showing a spend figure from somewhere else.
--
-- Run it alongside 0070-era code, which read every profile and every order
-- and filtered the orders once per user - a nested loop over two whole
-- tables, growing as the product of both.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_user_rows();
