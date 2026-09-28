-- Undo 0028. The emails themselves are untouched: these columns only record
-- what a human decided about a reply, and forgetting that does not unmake the
-- reply or any listing approved from it.

drop index if exists public.inbound_emails_rate_card_idx;

alter table public.inbound_emails drop column if exists rate_card_added_by;
alter table public.inbound_emails drop column if exists rate_card_added_at;
alter table public.inbound_emails drop column if exists rate_card_dismissed_at;
