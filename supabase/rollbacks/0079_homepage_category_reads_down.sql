-- ---------------------------------------------------------------------------
-- Undo 0079.
--
-- DESTROYS: every homepage read - the proposals nobody has applied yet, the
-- refusals that stop a dead domain being fetched again, and the record of
-- what each call cost. Re-reading them is another fetch and another model
-- call per site; at 1,840 sites that is pennies rather than pounds, but it
-- is also the review work done again.
--
-- The categories already applied are NOT undone. A category accepted by a
-- person is on `websites.primary_category_id` and stays there, which is
-- right: it was a human decision, and it is indistinguishable from one typed
-- in by hand once this column is gone.
--
-- That is the one thing to be sure about before running this. Dropping
-- `primary_category_source` loses which categories came from a homepage
-- read, and nothing else records it - so a later re-read cannot tell the
-- inferred ones from the stated ones and would have to leave all of them
-- alone or overwrite all of them.
--
-- Take a copy first if any of that matters:
--
--   create table website_category_reads_backup as
--     select * from public.website_category_reads;
--   create table websites_category_source_backup as
--     select id, primary_category_id, primary_category_source from public.websites
--     where primary_category_source is not null;
--
-- ## What going back costs
--
-- /admin/categorise fails outright rather than quietly showing an empty
-- backlog, which is the right failure on a screen whose whole job is to list
-- what still needs doing. Run it alongside 0078-era code.
-- ---------------------------------------------------------------------------

drop table if exists public.website_category_reads;

alter table public.websites
  drop constraint if exists websites_primary_category_source_check;

alter table public.websites
  drop column if exists primary_category_source;
