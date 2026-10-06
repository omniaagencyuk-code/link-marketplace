-- ---------------------------------------------------------------------------
-- Undo 0055.
--
-- DESTROYS: every saved site customers have set up - the client name, the
-- domain, the confirmed competitors and the market - and the cache of looked-up
-- competitors.
--
-- The saved sites are the loss that shows. An agency with twenty clients in
-- here has twenty sets of competitors somebody chose deliberately, and nothing
-- can recompute a choice. Export `gap_projects` before running this.
--
-- The suggestion cache cost fifty units a domain, which is small enough not to
-- matter; dropping it means each one is looked up again on the next ask.
--
-- Reports survive. `gap_runs.project_id` goes with the table, so a report
-- stops knowing which saved site it came from, but the report itself, its
-- results and what it cost are untouched - as is everything 0054 built.
--
-- `gap_lookups.kind` goes too, which leaves the ledger unable to tell a
-- fifty-unit suggestion from a 2,500-unit referring-domain pull. The sum is
-- unaffected, so the budget still reads correctly; only the breakdown is lost.
-- ---------------------------------------------------------------------------

drop index if exists public.gap_runs_project_idx;

alter table public.gap_runs drop column if exists project_id;

alter table public.gap_lookups drop constraint if exists gap_lookups_kind_known;
alter table public.gap_lookups drop column if exists kind;

drop table if exists public.competitor_suggestions;

-- The trigger goes with the table.
drop table if exists public.gap_projects;
