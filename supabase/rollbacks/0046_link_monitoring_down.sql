-- ---------------------------------------------------------------------------
-- Undo 0046.
--
-- DESTROYS: every monitoring row. `monitored_links`, `link_status_events` and
-- `guarantee_claims` go, and with them the record of which links were lost,
-- when, and what was agreed with the buyer about it. There is no other copy:
-- the durability scores are computed from these rows, and a claim's amount is
-- the only snapshot of what was charged at the moment it opened.
--
-- So this is not a rollback to run because a deploy looked wrong. Run it only
-- to unpick the feature deliberately, and take a dump of the three tables
-- first if any claim has ever been opened.
--
-- The durability columns on `websites` are dropped too. That is safe in the
-- sense that nothing else reads them, and permanent in the sense that they
-- cannot be recomputed once the links are gone.
-- ---------------------------------------------------------------------------

drop function if exists public.recompute_durability_scores(integer);

drop table if exists public.guarantee_claims;
drop table if exists public.link_status_events;
drop table if exists public.monitored_links;

alter table public.websites
  drop column if exists durability_pct,
  drop column if exists durability_sample,
  drop column if exists durability_window_months,
  drop column if exists durability_updated_at;

-- Last, because the tables above use them.
drop type if exists public.claim_status;
drop type if exists public.link_status;
