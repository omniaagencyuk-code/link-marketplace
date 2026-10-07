\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The two reads 0057 moved into the database.
--
-- Both replaced a JavaScript reduce over a table read whole, and both are
-- checked here for the thing that reduce could not do: be right about rows a
-- capped read never returned.
-- ---------------------------------------------------------------------------

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values
  ('c-1', 'a@pub.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('c-2', 'b@pub.test', 'Rates', 'new', timezone('utc', now()), 'body'),
  ('c-3', 'c@pub.test', 'Rates', 'extracted', timezone('utc', now()), 'body'),
  ('c-4', 'd@pub.test', 'Rates', 'ignored', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

insert into public.extraction_batches (id, mode, model, prompt_version, status, email_count)
values ('88888888-8888-8888-8888-888888888888', 'batch', 'test-model', 'v1', 'running', 1)
on conflict (id) do nothing;

-- One of the two 'new' emails is claimed by a running batch.
update public.inbound_emails
  set batch_id = '88888888-8888-8888-8888-888888888888'
  where message_id = 'c-2';

/*
  `new` with a batch is its own state.

  Counting it as waiting told the owner fifty were waiting while twenty-five
  were in flight, and put fifty on a button that would only ever send the
  unclaimed ones. The split used to happen in JavaScript; it now happens in
  the function, and this is what pins it there.
*/
/*
  `coalesce`, so a missing state is loud.

  The first version of this file failed to insert the batch - `model` is not
  null - so no email was ever claimed, the in-flight row did not exist, and the
  assertion printed a blank line the verifier's own `grep -v '^$'` swallowed.
  A check that stops checking has to say so.
*/
select 'claimed new is in-flight: ' ||
  coalesce((select total::text from public.sourcing_email_counts() where status = 'in-flight'),
           '(NONE - CHECK STOPPED CHECKING)');
select 'the claimed one is not counted as new as well: ' ||
  (select count(*) = 1 from public.inbound_emails
   where status = 'new' and batch_id is not null);
select 'extracted: ' ||
  coalesce((select total::text from public.sourcing_email_counts() where status = 'extracted'),
           '(NONE - CHECK STOPPED CHECKING)');

select 'every email is counted exactly once: ' ||
  ((select sum(total) from public.sourcing_email_counts()) = (select count(*) from public.inbound_emails));

-- ------------------------------------------------ contested drafts --------
insert into public.listing_drafts (email_id, domain, status, proposed)
select id, 'twice-quoted.test', 'pending', '{"guest_post_cost": 200, "currency": "USD"}'::jsonb
from public.inbound_emails where message_id = 'c-1';

/*
  The second offer is already approved, and that is the case this exists for.

  A domain quoted twice where one quote has been approved is exactly the
  comparison somebody needs to see. Reading only pending drafts would make it
  look uncontested and let the second quote overwrite the first's price and
  contact without anybody being asked.
*/
insert into public.listing_drafts (email_id, domain, status, proposed)
select id, 'twice-quoted.test', 'approved', '{"guest_post_cost": 260, "currency": "USD"}'::jsonb
from public.inbound_emails where message_id = 'c-2';

insert into public.listing_drafts (email_id, domain, status, proposed)
select id, 'quoted-once.test', 'pending', '{"guest_post_cost": 150, "currency": "USD"}'::jsonb
from public.inbound_emails where message_id = 'c-3';

-- A domain offered twice, but both already rejected, is not work.
insert into public.listing_drafts (email_id, domain, status, proposed)
select id, 'both-rejected.test', 'rejected', '{}'::jsonb
from public.inbound_emails where message_id = 'c-3';
insert into public.listing_drafts (email_id, domain, status, proposed)
select id, 'both-rejected.test', 'rejected', '{}'::jsonb
from public.inbound_emails where message_id = 'c-4';

select 'both sides of a contested domain come back: ' ||
  (select count(*) = 2 from public.sourcing_contested_drafts() where domain = 'twice-quoted.test');
select 'including the approved one: ' ||
  (select count(*) = 1 from public.sourcing_contested_drafts()
   where domain = 'twice-quoted.test' and status = 'approved');
select 'a domain quoted once is not contested: ' ||
  (select count(*) = 0 from public.sourcing_contested_drafts() where domain = 'quoted-once.test');
select 'nor is one whose copies were all rejected: ' ||
  (select count(*) = 0 from public.sourcing_contested_drafts() where domain = 'both-rejected.test');

/*
  Nothing uncontested comes back at all.

  The application used to read every open draft and filter; it now trusts the
  function to have filtered, so a function that returned extra rows would show
  single offers as duplicates with nothing left to catch it.
*/
select 'only contested domains are returned: ' ||
  (select count(distinct domain) = 1 from public.sourcing_contested_drafts());

-- The price is carried through, because ranking the offers is the whole point.
select 'the quoted price survives: ' ||
  (select count(*) = 1 from public.sourcing_contested_drafts()
   where domain = 'twice-quoted.test' and (proposed->>'guest_post_cost')::numeric = 260);
select 'and so does who sent it: ' ||
  (select count(*) = 2 from public.sourcing_contested_drafts()
   where domain = 'twice-quoted.test' and from_address like '%@pub.test');

-- ------------------------------------------------------ who may call them --
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform * from public.sourcing_contested_drafts();
  raise notice 'a customer may read the draft queue: ALLOWED';
exception
  when insufficient_privilege then raise notice 'a customer cannot read the draft queue: true';
end;
$$;
do $$
begin
  perform * from public.sourcing_email_counts();
  raise notice 'a customer may count our inbox: ALLOWED';
exception
  when insufficient_privilege then raise notice 'a customer cannot count our inbox: true';
end;
$$;
reset role; reset request.jwt.claim.sub;
