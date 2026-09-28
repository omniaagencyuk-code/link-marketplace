\pset tuples_only on
\pset format unaligned

-- The Gmail importer's tables hold mailbox names, search queries and the
-- publisher mail itself. None of it is customer-facing and none of it has a
-- customer-facing policy, deliberately - the same rule as inbound_emails.

insert into public.gmail_mailboxes (address, label) values ('info@omniaagency.uk', 'Outreach');

-- An address has to look like one. A typo in the allowlist is a mailbox that
-- silently never matches, which looks exactly like a mailbox with no mail.
do $$
begin
  insert into public.gmail_mailboxes (address) values ('not-an-address');
  raise notice 'a malformed mailbox was accepted: false';
exception
  when check_violation then raise notice 'a malformed mailbox is refused: true';
end;
$$;

insert into public.gmail_import_jobs (mailboxes, query, max_threads, started_by)
values (array['info@omniaagency.uk'], '-from:me newer_than:1y', 200, 'admin@pressparrot.com');

insert into public.gmail_import_items (job_id, mailbox, gmail_thread_id)
select id, 'info@omniaagency.uk', 'thread-aaa' from public.gmail_import_jobs limit 1;

-- One row per thread per mailbox, across every job: a second run of the same
-- query must find the thread already recorded rather than import it twice.
do $$
declare
  v_job uuid;
begin
  select id into v_job from public.gmail_import_jobs limit 1;
  insert into public.gmail_import_items (job_id, mailbox, gmail_thread_id)
  values (v_job, 'info@omniaagency.uk', 'thread-aaa');
  raise notice 'the same thread was imported twice: false';
exception
  when unique_violation then raise notice 'the same thread cannot be imported twice: true';
end;
$$;

-- The same thread id in a different mailbox is a different thread.
do $$
declare
  v_job uuid;
begin
  select id into v_job from public.gmail_import_jobs limit 1;
  insert into public.gmail_import_items (job_id, mailbox, gmail_thread_id)
  values (v_job, 'contact@omniaagency.uk', 'thread-aaa');
  raise notice 'the same id in another mailbox is allowed: true';
exception
  when unique_violation then raise notice 'the same id in another mailbox is allowed: false';
end;
$$;

-- --------------------------------------------------------------- as anon
set role anon;
select 'anon reads the allowlist: ' || count(*) from public.gmail_mailboxes;
select 'anon reads import jobs: ' || count(*) from public.gmail_import_jobs;
select 'anon reads import items: ' || count(*) from public.gmail_import_items;
reset role;

-- ------------------------------------------------- as a signed-in customer
-- The important one. A customer can read the marketplace; they must not be
-- able to read which mailboxes we have, what we search for, or anybody's mail.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads the allowlist: ' || count(*) from public.gmail_mailboxes;
select 'customer reads import jobs: ' || count(*) from public.gmail_import_jobs;
select 'customer reads import items: ' || count(*) from public.gmail_import_items;

do $$
begin
  insert into public.gmail_mailboxes (address) values ('victim@someoneelse.com');
  raise notice 'a customer added a mailbox: true';
exception
  when others then raise notice 'a customer cannot add a mailbox: true';
end;
$$;
reset role;

-- --------------------------------------------------------- as the admin
-- The service role, which is what the admin area runs as.
select 'admin reads the allowlist: ' || count(*) from public.gmail_mailboxes;
select 'admin reads import items: ' || count(*) from public.gmail_import_items;

-- ------------------------------------------------- an imported email row
-- A Gmail thread becomes an ordinary inbound email. What marks it out is
-- where it came from, and the set of Message-IDs that stops it being
-- imported again by another route.
insert into public.inbound_emails
  (message_id, from_address, body_text, source, mailbox, gmail_thread_id, message_ids, has_rate_card)
values
  ('in-1@publisher.example', 'hello@publisher.example', 'We charge 550 EUR.', 'gmail',
   'info@omniaagency.uk', 'thread-aaa', array['out-1@omniamedia.uk', 'in-1@publisher.example'], true);

select 'the email knows where it came from: ' || source
  from public.inbound_emails where message_id = 'in-1@publisher.example';
select 'and which thread: ' || gmail_thread_id
  from public.inbound_emails where message_id = 'in-1@publisher.example';
select 'a takeout upload of the same mail is found by overlap: ' ||
  (select count(*) from public.inbound_emails
    where message_ids && array['out-1@omniamedia.uk']);

-- An uploaded email predates all of this and must still be perfectly valid.
insert into public.inbound_emails (message_id, from_address, body_text)
values ('legacy@publisher.example', 'legacy@publisher.example', 'Older upload.');
select 'an uploaded email still defaults to upload: ' || source
  from public.inbound_emails where message_id = 'legacy@publisher.example';

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads publisher mail: ' || count(*) from public.inbound_emails;
reset role;

-- Purging is off until somebody turns it on.
select 'body purging is off by default: ' || purge_bodies_enabled from public.sourcing_settings where id = 1;
select 'and defaults to 90 days: ' || purge_bodies_after_days from public.sourcing_settings where id = 1;

-- ------------------------------------------------ the rate card worklist
-- A reply that sent a spreadsheet instead of a price. It produced no draft,
-- which is correct, and the columns below are what let a human act on it
-- rather than scroll past it.
insert into public.inbound_emails (message_id, from_address, body_text, status, status_reason)
values ('sheet@publisher.example', 'ana@publisher.example',
        'Our rates are here: https://docs.google.com/spreadsheets/d/abc/edit',
        'ignored', 'Reply only links to an external rate-card spreadsheet.');

select 'a new lead is not dismissed: ' || coalesce(no_draft_dismissed_at::text, 'null')
  from public.inbound_emails where message_id = 'sheet@publisher.example';
select 'nor handled: ' || coalesce(no_draft_handled_at::text, 'null')
  from public.inbound_emails where message_id = 'sheet@publisher.example';
select 'and nobody has added rates yet: ' || coalesce(rate_card_added_at::text, 'null')
  from public.inbound_emails where message_id = 'sheet@publisher.example';

-- Dismissing takes it off the list without touching the email.
-- Ticked off: a listing exists because somebody read this email. Recorded,
-- not deleted, because that is a different fact from "nothing worth having".
update public.inbound_emails
  set no_draft_handled_at = timezone('utc', now()), no_draft_handled_by = 'admin@pressparrot.com'
  where message_id = 'sheet@publisher.example';
select 'who added it by hand is recorded: ' || no_draft_handled_by
  from public.inbound_emails where message_id = 'sheet@publisher.example';

update public.inbound_emails set no_draft_dismissed_at = timezone('utc', now())
  where message_id = 'sheet@publisher.example';
select 'the email survives both: ' || length(body_text)
  from public.inbound_emails where message_id = 'sheet@publisher.example';

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads rate card leads: ' || count(*)
  from public.inbound_emails where status = 'ignored';
reset role;
