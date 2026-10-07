-- ---------------------------------------------------------------------------
-- Undo 0062.
--
-- DESTROYS: the list of senders we refuse to buy from, and the reason each was
-- added. Nothing else - the replies themselves are untouched, as they were
-- throughout, and no listing was ever changed by a block.
--
-- What running it actually costs is the blocks. Every address on that list was
-- somebody a person looked at and decided against, usually for quoting several
-- times what four other sellers quote for the same site, and there is no way to
-- work out who they were afterwards: the replies come back as unread and the
-- next extraction run pays to read every one of them again.
--
-- So export `sourcing_blocklist` before running this if the blocks are to
-- survive, and put the senders back by hand afterwards.
--
-- The replies silenced by a block stay `ignored` with the reason 'Sender
-- blocked' - the trigger is gone, so nothing re-examines them. Clear them with:
--
--   update public.inbound_emails set status = 'new', status_reason = null
--   where status = 'ignored' and status_reason = 'Sender blocked';
-- ---------------------------------------------------------------------------

drop trigger if exists inbound_emails_refuse_blocked on public.inbound_emails;
drop function if exists public.inbound_emails_refuse_blocked();
drop function if exists public.sourcing_unblock_sender(text);
drop function if exists public.sourcing_block_sender(text, text, text, text);
drop function if exists public.sourcing_sender_blocked(text);
drop table if exists public.sourcing_blocklist;
