-- ---------------------------------------------------------------------------
-- Undo 0054.
--
-- DESTROYS: every gap report customers have run and its results, the cached
-- referring-domain pulls, and the ledger of what Ahrefs charged for them.
--
-- The cache is the expensive one. Those pulls were paid for in Ahrefs units -
-- a few thousand per domain - and dropping them does not just lose the rows,
-- it means the next report for each of those domains is bought again at full
-- price. Export `refdomain_snapshots` first if there is any chance of putting
-- the feature back.
--
-- The ledger is what the gap budget is counted from. Dropping it mid-cycle
-- resets the feature's spend to zero, so re-applying 0054 in the same cycle
-- starts from nothing and can spend the allowance twice over.
--
-- Nothing else is touched. The refresh's own budget, ledger and settings are
-- separate tables and separate functions, which is the whole point of them
-- being separate - backing this feature out cannot affect the nightly refresh.
-- ---------------------------------------------------------------------------

drop function if exists public.gap_sellable(text[]);
drop function if exists public.gap_runs_this_cycle(uuid);
drop function if exists public.gap_units_this_cycle();
drop function if exists public.gap_cycle_start();

drop table if exists public.gap_results;
drop table if exists public.gap_runs;
drop table if exists public.gap_lookups;
drop table if exists public.refdomain_snapshots;
drop table if exists public.gap_settings;

drop type if exists public.gap_run_status;
