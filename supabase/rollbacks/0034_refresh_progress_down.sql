-- ============================================================================
-- Rollback 0034  Refresh progress
-- ============================================================================
-- Drops the denominator. Safe: it is a measurement of a run rather than
-- anything a run acted on, and the counters beside it are untouched.
-- ============================================================================

alter table public.refresh_runs
  drop column if exists domains_total;
