-- ---------------------------------------------------------------------------
-- Undo 0052.
--
-- DESTROYS: nothing. It drops a read-only function. No table, column or row
-- is touched, and the tiers themselves are untouched either way - 0052 never
-- wrote one.
--
-- Only run it alongside application code that does not call
-- `ahrefs_tier_preview`. With this dropped and that code still deployed, the
-- Assign tiers button fails on its preview call before it assigns anything,
-- and the server-side refusal that stops an unaffordable cadence goes with it.
-- ---------------------------------------------------------------------------

drop function if exists public.ahrefs_tier_preview(integer, integer);
