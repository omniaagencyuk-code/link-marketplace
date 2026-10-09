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
-- rendered all of them with no paging, in one request whose error it threw
-- away. That is survivable while the order book is small - it was 2 orders
-- when 0074 was written - and stops being so without any sign, because
-- PostgREST caps the response and says nothing in it.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_order_page(text, text, integer, integer);
