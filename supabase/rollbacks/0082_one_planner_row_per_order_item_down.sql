-- ---------------------------------------------------------------------------
-- Undo 0082  One planner row per order item
--
-- Destroys nothing. It drops one unique index and puts 0081's plain index
-- back, so every planner row survives untouched either way.
--
-- What comes back with it is the gap the unique index closed: the order
-- import's duplicate check becomes a read followed by an insert with
-- nothing between them, and two clicks of Import orders - or two tabs - can
-- put the same placement in a plan twice. The duplicates are the
-- customer's to delete and the planner's monthly totals count both until
-- they do, so a month reads as having bought a link it bought once.
--
-- Run it only if the unique index is itself the problem: an inventory with
-- duplicates already in it cannot have the index created, and a rollback
-- is the way to leave that state alone while it is sorted out by hand.
-- ---------------------------------------------------------------------------

drop index if exists public.planner_links_one_per_order_item;

create index if not exists planner_links_order_item_idx
  on public.planner_links (order_item_id)
  where order_item_id is not null;
