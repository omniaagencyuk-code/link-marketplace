-- ============================================================================
-- 0034  How far through a refresh run is
-- ============================================================================
-- A run walks nine hundred and fifty domains in batches of a hundred. The
-- row that records it was written once at the start and once at the end, so
-- for the whole of the middle it said "running" and nothing else - no count,
-- no progress, nothing to put on screen. Somebody watching it had the same
-- information as somebody who had closed the tab.
--
-- One column: how many domains the run set out to do. The counters that say
-- how many are done already exist - they were simply not written until the
-- run finished, which is a change in the code rather than here.
--
-- Nullable, because runs recorded before this existed had no such number and
-- inventing one for them would be a measurement nobody took.
--
-- Reversible: supabase/rollbacks/0034_refresh_progress_down.sql
-- ============================================================================

alter table public.refresh_runs
  add column if not exists domains_total integer;

comment on column public.refresh_runs.domains_total is
  'How many domains this run set out to refresh, so progress has a denominator. Null on runs recorded before it was tracked.';
