-- ---------------------------------------------------------------------------
-- Undo 0058.
--
-- DESTROYS: the record of which approve-all runs happened, who started them
-- and what they approved. The listings those runs created are untouched -
-- `draft-approval.ts` wrote them, not this - and the drafts keep their
-- approved status.
--
-- The eligibility rules go with the functions. They existed before 0058 inside
-- `bulkApproveConfidentAction`, which still has its own copy, so the hundred-
-- at-a-time path through the browser keeps working; only the background run
-- stops being possible.
--
-- Only run it alongside code that does not call `startApprovalRun`, and
-- remove `/api/cron/draft-approvals` from vercel.json, or the cron ticks every
-- five minutes against a missing function.
-- ---------------------------------------------------------------------------

drop function if exists public.claim_draft_approval_run(integer);
drop function if exists public.draft_approval_eligible_count();
drop function if exists public.draft_approval_batch(integer, uuid[]);

drop table if exists public.draft_approval_runs;
