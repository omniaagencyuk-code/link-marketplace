-- ---------------------------------------------------------------------------
-- Undo 0081  The Link Building Planner
--
-- DESTROYS every customer's entire link-building plan: every link they have
-- planned or recorded, what they paid and to whom, their custom statuses,
-- their supplier names, their monthly budgets and their private notes. For
-- an agency that moved off a spreadsheet, this is the spreadsheet.
--
-- None of it can be recovered and none of it exists anywhere else. Take a
-- copy first, always:
--
--   create table planner_links_backup as select * from public.planner_links;
--   create table planner_statuses_backup as select * from public.planner_statuses;
--   create table planner_sources_backup as select * from public.planner_sources;
--   create table planner_months_backup as select * from public.planner_months;
--   select id, user_id, monthly_budget_minor, monthly_link_target, currency,
--          notes, archived_at
--     from public.gap_projects
--    where monthly_budget_minor is not null or monthly_link_target is not null
--       or notes <> '' or archived_at is not null;
--
-- It also drops the five planner columns from `gap_projects`. The projects
-- themselves survive - they are the Link Gap Finder's and predate this - but
-- their budgets, targets, currency, notes and archived state go, and an
-- archived project reappears in the gap finder's list.
--
-- Nothing else is touched. `consume_rate_limit` and `rate_limits` are 0009's
-- and are used by sign-in; `order_items` is referenced and not altered.
-- ---------------------------------------------------------------------------

drop trigger if exists planner_links_same_owner_check on public.planner_links;
drop trigger if exists planner_months_same_owner_check on public.planner_months;

drop table if exists public.planner_links;
drop table if exists public.planner_months;
drop table if exists public.planner_sources;
drop table if exists public.planner_statuses;

drop function if exists public.planner_links_same_owner();
drop function if exists public.planner_months_same_owner();
drop function if exists public.planner_seed_statuses(uuid);

alter table public.gap_projects drop column if exists monthly_budget_minor;
alter table public.gap_projects drop column if exists monthly_link_target;
alter table public.gap_projects drop column if exists currency;
alter table public.gap_projects drop column if exists notes;
alter table public.gap_projects drop column if exists archived_at;
