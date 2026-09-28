-- Undo 0029. The emails are untouched throughout: these columns only record
-- what a human decided about a reply.

drop index if exists public.inbound_emails_no_draft_idx;

alter table public.inbound_emails drop column if exists no_draft_handled_by;
alter table public.inbound_emails drop column if exists no_draft_handled_at;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_emails'
      and column_name = 'no_draft_dismissed_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_emails'
      and column_name = 'rate_card_dismissed_at'
  ) then
    alter table public.inbound_emails rename column no_draft_dismissed_at to rate_card_dismissed_at;
  end if;
end;
$$;

create index if not exists inbound_emails_rate_card_idx
  on public.inbound_emails (status, rate_card_dismissed_at)
  where status = 'ignored';
