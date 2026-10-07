-- ---------------------------------------------------------------------------
-- Undo 0057.
--
-- DESTROYS: nothing. It drops two read-only functions and one index.
--
-- The cost of running it is the publisher inbox going back to what 0057 fixed:
-- the duplicate finder reads every pending and approved draft with its jsonb
-- and a join, in ten round trips, growing with every approval; and the status
-- tiles go back to counting a thousand-row capped read, so they describe
-- whichever thousand emails came back rather than the inbox.
--
-- Only run it alongside code from before 0057, which does that work in
-- JavaScript. With the current code the page's status tiles read zero and the
-- duplicates card reads empty - the error naming the missing function is the
-- only thing that would say why.
-- ---------------------------------------------------------------------------

drop function if exists public.sourcing_contested_drafts();
drop function if exists public.sourcing_email_counts();
drop index if exists public.listing_drafts_open_domain_idx;
