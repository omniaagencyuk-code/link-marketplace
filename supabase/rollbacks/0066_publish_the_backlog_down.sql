-- ---------------------------------------------------------------------------
-- Undo 0066.
--
-- DESTROYS: the record of which publish runs happened, who started them and
-- what they published. The listings those runs made live stay live - the run
-- only changed a status, and dropping the bookkeeping does not unpublish
-- anything.
--
-- What it costs is the only way to publish a large backlog. Back to the admin
-- table: tick them, press Publish, twenty-five per request at about four round
-- trips each, with a browser tab that has to stay open. For a handful that is
-- fine and it is what the button is for; for seven thousand it is the best
-- part of an hour.
--
-- Remove `/api/cron/publish-backlog` from vercel.json at the same time, or the
-- cron ticks every five minutes against a missing function.
-- ---------------------------------------------------------------------------

drop function if exists public.claim_website_publish_run(integer);
drop function if exists public.website_publish_eligible_count();
drop function if exists public.website_publish_candidates(integer, uuid[]);
drop table if exists public.website_publish_runs;
