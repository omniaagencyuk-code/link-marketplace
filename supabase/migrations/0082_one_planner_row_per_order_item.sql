-- ---------------------------------------------------------------------------
-- 0082  One planner row per order item
--
-- 0081 gave `planner_links` an `order_item_id` and a plain index on it, so
-- the planner could tell which rows it had already pulled in from a
-- customer's Press Parrot orders. The brief's rule is that importing twice
-- must not make two of each, and that index does not enforce it - it only
-- makes the question cheap to ask.
--
-- Asking is not enforcing. The import reads which order items are already
-- in a plan, then inserts the rest, and between those two statements a
-- second click of the same button is a second import of the same orders.
-- A unique index is the one version of this rule that holds when the
-- application forgets, which is the same reason `outbound_emails` checks
-- its approver in a constraint and the suppression check is a trigger: a
-- rule that depends on every future caller remembering it is not a rule.
--
-- Partial, because `order_item_id` is null on every link a customer typed
-- or imported from a spreadsheet, and those are most of them. Keyed on
-- `user_id` as well as the item, which costs nothing and means the index
-- cannot be read as a claim that two customers could ever share an order
-- item - they cannot, but the plan is the customer's and every other index
-- on this table starts with them.
--
-- Re-runnable. If duplicates already exist the create fails and names the
-- pair, which is the right failure: it is somebody's plan, and the import
-- cannot know which of the two rows they have since edited. The file below
-- shows how to find them.
--
--   select user_id, order_item_id, count(*)
--     from public.planner_links
--    where order_item_id is not null
--    group by 1, 2
--   having count(*) > 1;
--
-- Nothing else changes. No column, no policy, no row.
-- ---------------------------------------------------------------------------

create unique index if not exists planner_links_one_per_order_item
  on public.planner_links (user_id, order_item_id)
  where order_item_id is not null;

/* The plain index 0081 created is now redundant: the unique one above has
   the same leading columns for the same lookup. Dropped rather than left,
   because two indexes on one predicate is a write cost nobody chose. */
drop index if exists public.planner_links_order_item_idx;
