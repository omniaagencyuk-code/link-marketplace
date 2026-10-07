\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Senders we will not buy from.
--
-- The block is applied by a trigger on `inbound_emails` rather than by
-- whoever is inserting into it, for the reason `sales_suppressions` gives in
-- its own words: a suppression that depends on every future caller
-- remembering it is not a suppression. There are four ways a reply can enter
-- this system, so that is what the first checks are about - a block that
-- works only when called through the right function is a block that leaks.
--
-- The failure mode throughout is silence. A block that matched too much would
-- stop the pipeline finding anything and say nothing about why, so the rows
-- that must NOT be caught are half of what is below.
-- ---------------------------------------------------------------------------

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values ('blk-seed', 'untouched@fine.test', 'Rates', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

-- ------------------------------------------------- an address, applied late

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values
  ('blk-1', 'pricey@reseller.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('blk-2', 'colleague@reseller.test', 'Rates', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'blocked-site.test', 'pending', '{"guest_post_cost": 150}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'blk-1';

-- An approved draft from the same sender. It is where a listing's price came
-- from, so blocking must not delete it: the listing would stay and the record
-- of where its number came from would be gone.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'already-bought.test', 'approved', '{"guest_post_cost": 150}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'blk-1';

select 'blocking an address deletes their waiting draft: ' ||
  (select drafts_removed = 1 from public.sourcing_block_sender('pricey@reseller.test', null, 'too dear', 'me'));

select 'their approved draft is left alone: ' ||
  (select count(*) = 1 from public.listing_drafts where domain = 'already-bought.test');

select 'their unread reply is silenced: ' ||
  (select status = 'ignored' and status_reason = 'Sender blocked'
   from public.inbound_emails where message_id = 'blk-1');

/*
  The colleague at the same company is NOT blocked by an address block.

  This is the line between the two kinds of block, and getting it wrong in
  this direction is how one careless entry silences a company we buy from.
*/
select 'a colleague at the same company is untouched: ' ||
  (select status = 'new' from public.inbound_emails where message_id = 'blk-2');

select 'and an unrelated sender is untouched: ' ||
  (select status = 'new' from public.inbound_emails where message_id = 'blk-seed');

-- -------------------------------------------------- the trigger, on arrival

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values ('blk-3', 'pricey@reseller.test', 'Rates again', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

select 'a new reply from a blocked sender is ignored on arrival: ' ||
  (select status = 'ignored' from public.inbound_emails where message_id = 'blk-3');

-- Case and spacing are the sender's, not ours.
insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values ('blk-4', 'Pricey@Reseller.TEST', 'Rates', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

select 'the match ignores case: ' ||
  (select status = 'ignored' from public.inbound_emails where message_id = 'blk-4');

-- ------------------------------------------------------ a whole company

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values
  ('blk-5', 'anna@bulk.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('blk-6', 'ben@bulk.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('blk-7', 'carl@notbulk.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('blk-8', 'dee@sub.bulk.test', 'Rates', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

select 'blocking a domain silences two of its people: ' ||
  (select emails_ignored = 2 from public.sourcing_block_sender(null, 'bulk.test', null, 'me'));

select 'a company with a similar name is untouched: ' ||
  (select status = 'new' from public.inbound_emails where message_id = 'blk-7');

/*
  A subdomain is a different host and is NOT caught.

  `sub.bulk.test` is near certainly the same company, and near certainly is
  the wrong standard for a rule whose failure is silent. The same call the TS
  side makes - exact on the host - so the two cannot drift.
*/
select 'a subdomain sender is not caught by the parent domain: ' ||
  (select status = 'new' from public.inbound_emails where message_id = 'blk-8');

-- --------------------------------------------------------------- unblocking

select 'unblocking puts the silenced replies back: ' ||
  (select public.sourcing_unblock_sender('bulk.test') = 2);

select 'and they are unread again, with the reason cleared: ' ||
  (select status = 'new' and status_reason is null
   from public.inbound_emails where message_id = 'blk-5');

/*
  Blocked twice, unblocked once, still blocked.

  The wake-up re-runs the blocked check per row rather than trusting that the
  row was silenced by the entry just removed. Without that, lifting an address
  block on somebody whose whole company is also blocked would wake them.
*/
insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values ('blk-9', 'erin@double.test', 'Rates', 'new', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

select 'a sender blocked twice over: ' ||
  (select public.sourcing_block_sender('erin@double.test', null, null, 'me') is not null);
select 'blocked by their company too: ' ||
  (select public.sourcing_block_sender(null, 'double.test', null, 'me') is not null);

select 'lifting one of two blocks wakes nobody: ' ||
  (select public.sourcing_unblock_sender('erin@double.test') = 0);
select 'and they are still silenced: ' ||
  (select status = 'ignored' from public.inbound_emails where message_id = 'blk-9');
select 'lifting the second one does wake them: ' ||
  (select public.sourcing_unblock_sender('double.test') = 1);

/*
  A reply read before the block stays read.

  Its drafts went with the block, and re-reading it would be a second charge
  for an answer we already have and already decided against.
*/
insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values ('blk-10', 'old@gone.test', 'Rates', 'extracted', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

select 'blocking a company with an already-read reply: ' ||
  (select emails_ignored = 0 from public.sourcing_block_sender(null, 'gone.test', null, 'me'));
select 'leaves that reply read rather than re-opening it: ' ||
  (select status = 'extracted' from public.inbound_emails where message_id = 'blk-10');

-- ------------------------------------------------------------------ refusals

/*
  Caught rather than asserted around.

  The first version of this check read `when ... then 'false' else 'false'`,
  which passes whatever the function does - the same way test 17 and test 20
  each quietly stopped testing. The only honest way to assert a raise is to
  let it raise and catch it.
*/
do $$
declare
  v_raised boolean := false;
begin
  begin
    perform public.sourcing_block_sender(null, null, null, 'me');
  exception when others then
    v_raised := true;
  end;
  raise notice 'a block with neither address nor domain is refused: %', v_raised;
end;
$$;

-- ---------------------------------------------------------------------- RLS

select 'the blocklist is internal, with no customer-facing policy: ' ||
  (select count(*) = 0
   from pg_policies
   where schemaname = 'public'
     and tablename = 'sourcing_blocklist'
     and policyname not ilike '%admin%');

select 'and row level security is on: ' ||
  (select relrowsecurity from pg_class where oid = 'public.sourcing_blocklist'::regclass);

-- ------------------------------------------------- who may call these at all

/*
  `security definer` runs past row level security, and PostgREST publishes
  every function in `public` as an RPC endpoint. PostgreSQL grants EXECUTE to
  PUBLIC by default, so a function written without a revoke is an
  unauthenticated POST away from deleting drafts.

  This is not hypothetical. The first draft of 0062 had no revokes, and
  `set role anon; select * from sourcing_block_sender('evil@test.test', ...)`
  returned 0|0 and left a row in the blocklist. Checked here rather than
  trusted to the next person remembering.
*/
do $$
declare
  fn text;
  v_refused boolean;
begin
  foreach fn in array array[
    'select public.sourcing_sender_blocked(''x@y.test'')',
    'select * from public.sourcing_block_sender(''x@y.test'', null, null, null)',
    'select public.sourcing_unblock_sender(''x@y.test'')'
  ] loop
    v_refused := false;
    begin
      set local role anon;
      execute fn;
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    raise notice 'anon is refused: % -> %', left(fn, 46), v_refused;
  end loop;
end;
$$;
