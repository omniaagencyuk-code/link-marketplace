-- ---------------------------------------------------------------------------
-- Undo 0070.
--
-- DESTROYS: nothing. Two functions that only read, neither of them a definer.
--
-- The cost is the customer dashboard, which fails outright rather than
-- quietly showing a figure from somewhere else. On a screen showing one
-- customer their own spend, that is the only acceptable failure.
--
-- Run it alongside 0069-era code, which read every order the customer has
-- with every item on each one, counted them in JavaScript, and then read them
-- all again for a table of five.
-- ---------------------------------------------------------------------------

drop function if exists public.customer_recommendations(integer);
drop function if exists public.customer_dashboard_summary();
