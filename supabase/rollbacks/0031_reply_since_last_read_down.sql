-- Undo 0031. Drafts already flagged keep their flag: it is stored on the
-- draft, not derived from this column.

alter table public.inbound_emails drop column if exists reply_since_last_read;
