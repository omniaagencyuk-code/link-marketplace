-- Undo 0027.
--
-- The three tables are dropped whole; they hold no data the rest of the
-- system depends on, and `inbound_emails.email_id` references are set null by
-- the drop rather than cascading into the emails themselves.
--
-- The columns on `inbound_emails` are dropped last. Any email imported from
-- Gmail stays exactly where it is - it is an ordinary publisher reply once it
-- has been stored, and forgetting where it came from does not unmake it.

drop table if exists public.gmail_import_items;
drop table if exists public.gmail_import_jobs;
drop table if exists public.gmail_mailboxes;

alter table public.inbound_emails drop column if exists has_rate_card;
alter table public.inbound_emails drop column if exists attachments;
alter table public.inbound_emails drop column if exists message_ids;
alter table public.inbound_emails drop column if exists gmail_thread_id;
alter table public.inbound_emails drop column if exists mailbox;
alter table public.inbound_emails drop column if exists source;

alter table public.sourcing_settings drop column if exists purge_bodies_after_days;
alter table public.sourcing_settings drop column if exists purge_bodies_enabled;
