-- ---------------------------------------------------------------------------
-- Undo 0084  How many of our publishers already link to them
--
-- Destroys the counts. Every prospect keeps its row, its research, its
-- qualification and its contacts; what goes is how many of our own publishers
-- were seen linking to each one.
--
-- That figure was counted by hand from Ahrefs exports and is not derivable
-- from anything else in this database, so it cannot be rebuilt - it has to be
-- re-exported and re-counted. Copy it out first if the lists are gone:
--
--   select domain, placements_seen from public.prospects
--    where placements_seen is not null order by placements_seen desc;
--
-- Scores computed while the column existed keep the `placements` component in
-- `score_breakdown`, which will then describe a figure nothing holds any
-- more. Re-score after running this, or the panel shows arithmetic that no
-- longer adds up.
-- ---------------------------------------------------------------------------

drop index if exists public.prospects_placements_seen_idx;

alter table public.prospects drop column if exists placements_seen;
