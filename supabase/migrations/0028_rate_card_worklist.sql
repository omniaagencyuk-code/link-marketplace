-- ============================================================================
-- 0028  The replies that sent a rate card instead of a price
-- ============================================================================
-- A large share of publishers never quote a number in the email. They attach
-- a PDF, or link a Google Sheet, or send a proposal document. The extraction
-- reads the text, finds no prices, and marks the email 'ignored' with a
-- perfectly accurate reason - and a keen publisher with a full rate card ends
-- up in a grey box nobody can act on.
--
-- These two columns turn that box into a worklist:
--
--   rate_card_dismissed_at  somebody looked and it was not a rate card after
--                           all, so it drops off the list rather than sitting
--                           there being scrolled past for ever.
--   rate_card_added_at      somebody read the attachment and pasted the rates
--                           in. Recorded because a price a human typed is a
--                           different kind of fact from one the model read,
--                           and when a listing is argued about later, which
--                           of the two it was, is the first question.
--
-- No attachment is downloaded and no URL is fetched by any of this. The
-- filenames and links were already stored; this only records what a human
-- decided about them.
--
-- Reversible: supabase/rollbacks/0028_rate_card_worklist_down.sql
-- ============================================================================

alter table public.inbound_emails
  add column if not exists rate_card_dismissed_at timestamptz;

alter table public.inbound_emails
  add column if not exists rate_card_added_at timestamptz;

alter table public.inbound_emails
  add column if not exists rate_card_added_by text;

comment on column public.inbound_emails.rate_card_added_at is
  'When a human pasted rate card contents into this email. The prices after that point were typed by a person, not read from the reply.';

-- The worklist reads ignored emails and nothing else, so the index matches
-- the query rather than the column.
create index if not exists inbound_emails_rate_card_idx
  on public.inbound_emails (status, rate_card_dismissed_at)
  where status = 'ignored';
