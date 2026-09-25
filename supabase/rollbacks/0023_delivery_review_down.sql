-- Undo 0023_delivery_review.sql.
--
-- Drops the issue thread and every column the delivery review added. The
-- issues themselves go with it, which is the point of a rollback but is
-- worth saying out loud: a customer complaint is not recoverable from
-- anywhere else, so take a copy first if any have been raised.

drop table if exists public.order_item_issues;

alter table public.settings drop column if exists post_approval_issue_days;
alter table public.settings drop column if exists delivery_auto_approve_days;

alter table public.orders drop column if exists completed_at;

drop index if exists public.order_items_awaiting_approval_idx;

alter table public.order_items drop column if exists auto_approved;
alter table public.order_items drop column if exists auto_approve_at;
alter table public.order_items drop column if exists approved_at;
alter table public.order_items drop column if exists delivered_at;
alter table public.order_items drop column if exists approval;

-- Last, because the column above depends on it.
drop type if exists public.item_approval;
