-- ============================================================================
-- 0029  Every reply that produced no draft, as a worklist
-- ============================================================================
-- 0028 gave the replies carrying a rate card somewhere to be worked through.
-- The rest - a reply with prices in prose we could not read, a publisher who
-- answered from a different address, an email whose domain nobody could
-- identify - still land in a grey box with no actions on it, and there are
-- more of those than there are rate cards.
--
-- So the list becomes every ignored reply, and the columns are renamed to say
-- so. `rate_card_dismissed_at` was accurate when the only list was rate
-- cards; on a list covering everything it would be a name that has stopped
-- describing what it holds, which is how the next person misreads it.
--
--   no_draft_dismissed_at   removed from the list: nothing here worth having.
--   no_draft_handled_at     dealt with by hand - the site was added to the
--                           marketplace from this reply. Kept rather than
--                           deleted, because "a human added this listing
--                           after reading the email themselves" is a fact
--                           worth being able to look up later.
--
-- `rate_card_added_at` keeps its name: it means what it says, that somebody
-- pasted a rate card's contents into the email.
--
-- Reversible: supabase/rollbacks/0029_no_draft_worklist_down.sql
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_emails'
      and column_name = 'rate_card_dismissed_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inbound_emails'
      and column_name = 'no_draft_dismissed_at'
  ) then
    alter table public.inbound_emails rename column rate_card_dismissed_at to no_draft_dismissed_at;
  end if;
end;
$$;

alter table public.inbound_emails
  add column if not exists no_draft_dismissed_at timestamptz;

alter table public.inbound_emails
  add column if not exists no_draft_handled_at timestamptz;

alter table public.inbound_emails
  add column if not exists no_draft_handled_by text;

comment on column public.inbound_emails.no_draft_handled_at is
  'When an admin added this publisher to the marketplace by hand after reading the reply themselves. Not the same as dismissed, which means there was nothing worth having.';

comment on column public.inbound_emails.no_draft_dismissed_at is
  'When an admin decided this reply was not worth acting on. It leaves the worklist and does not come back.';

drop index if exists public.inbound_emails_rate_card_idx;

create index if not exists inbound_emails_no_draft_idx
  on public.inbound_emails (status, no_draft_dismissed_at, no_draft_handled_at)
  where status = 'ignored';
