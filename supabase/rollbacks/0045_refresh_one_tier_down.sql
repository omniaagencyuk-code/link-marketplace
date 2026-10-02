-- ---------------------------------------------------------------------------
-- Undo 0045.
--
-- DESTROYS: nothing. It drops the two-argument form of the selection, leaving
-- the one-argument form 0013 created, which takes whatever is due in tier
-- order.
--
-- Only run this with application code that does not pass a tier. A deploy that
-- does will fail its RPC call with "function does not exist" on every run,
-- which the run records as a failure rather than silently refreshing
-- everything - but it will not refresh anything either.
-- ---------------------------------------------------------------------------

drop function if exists public.ahrefs_due_domains(integer, smallint);
