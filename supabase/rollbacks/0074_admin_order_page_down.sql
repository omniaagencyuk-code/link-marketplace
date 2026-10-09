-- ---------------------------------------------------------------------------
-- Undo 0074.
--
-- DESTROYS: nothing. One function that only reads.
--
-- The cost is `/admin/orders`, which fails outright rather than quietly
-- showing a different set of orders than the filter claims - the safer
-- failure on a screen people move orders through fulfilment from.
--
-- Run it alongside 0073-era code, and know what comes back with it: that
-- version read every order with every item and every issue joined on and
-- rendered all of them into one table with no paging, which PostgREST caps
-- at a thousand rows without saying so. The oldest orders are then missing
-- and the count above the table is the cap rather than the truth.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_order_page(text, text, integer, integer);
