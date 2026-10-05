-- ---------------------------------------------------------------------------
-- Undo 0048.
--
-- DESTROYS: the record of which sweeps have run, and the record of which
-- listings have already been read. The descriptions themselves survive - they
-- are on `websites.description` and nothing here touches them.
--
-- Losing `description_checked_at` is not harmless, though. It is the column
-- that stops a sweep re-reading the sixty per cent of homepages that carry
-- nothing usable, so the next sweep after this rollback starts from the
-- assumption that nothing has ever been tried, and will work through the
-- whole inventory again.
--
-- Any sweep still running is orphaned rather than stopped: its row goes, and
-- the cron that was carrying it will find nothing to claim and do nothing,
-- which is the correct outcome.
-- ---------------------------------------------------------------------------

drop function if exists public.description_sweep_batch(timestamptz, integer);
drop function if exists public.claim_description_run(integer);

drop table if exists public.description_runs;

drop index if exists public.websites_description_sweep_idx;
alter table public.websites drop column if exists description_checked_at;
