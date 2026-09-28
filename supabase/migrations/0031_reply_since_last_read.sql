-- ============================================================================
-- 0031  A draft that came back because they replied again
-- ============================================================================
-- A thread that gains a new reply is read again - that is deliberate, and it
-- is usually the reply with the price in it, arriving after a chaser. The
-- draft is replaced rather than duplicated, which is right.
--
-- What was missing is that nobody could tell. An approved draft reverts to
-- pending and reappears in the review queue looking like new work, with
-- nothing on it saying the publisher had written again. Somebody would
-- reasonably assume they had already dealt with it and skip past the very
-- thing they were waiting for.
--
-- Set when a thread is stored with messages we have not seen before, cleared
-- when the draft carrying the flag is written, so it marks the one reading
-- that followed the new reply rather than every reading thereafter.
--
-- Reversible: supabase/rollbacks/0031_reply_since_last_read_down.sql
-- ============================================================================

alter table public.inbound_emails
  add column if not exists reply_since_last_read boolean not null default false;

comment on column public.inbound_emails.reply_since_last_read is
  'True between a new reply arriving on an already-imported thread and the next reading of it. The draft that reading produces is flagged, and this is cleared.';
