-- ---------------------------------------------------------------------------
-- Undo 0069.
--
-- DESTROYS: nothing. Six functions that only count.
--
-- What it costs is the admin dashboard, which fails outright against missing
-- functions rather than quietly showing a figure from somewhere else - the
-- safer failure for a screen whose numbers get reported to other people.
--
-- Run it alongside 0068-era code, which did this arithmetic in JavaScript
-- after reading every listing with its costs and contacts joined on, every
-- order and every profile. That version works and is slow in proportion to
-- the inventory.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_queue_counts();
drop function if exists public.admin_recent_orders(integer);
drop function if exists public.admin_top_categories(integer);
drop function if exists public.admin_orders_by_status(timestamptz, timestamptz);
drop function if exists public.admin_revenue_series(timestamptz, timestamptz);
drop function if exists public.admin_dashboard_totals(timestamptz, timestamptz);
