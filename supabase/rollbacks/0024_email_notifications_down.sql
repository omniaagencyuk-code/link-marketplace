-- Undo 0024_email_notifications.sql.
--
-- Drops the record of everything we ever sent. If an auto-approval is under
-- dispute, that record is the evidence - take a copy before running this.

drop table if exists public.email_log;

alter table public.settings drop column if exists approval_reminder_days;

alter table public.order_items drop column if exists reminder_sent_at;
