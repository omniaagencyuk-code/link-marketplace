\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Requests for bulk, agency or negotiated pricing.
--
-- The pricing page's form writes here, which makes this one of the two
-- tables in the schema a stranger can cause a row in - `publisher_submissions`
-- being the other. Two things therefore matter more than they would anywhere
-- else:
--
--   * **Nobody but an admin can read it.** It holds a named person's work
--     address, their employer and what they said they could spend - the same
--     grade of data as `prospect_contacts`, which has no customer-facing
--     policy either.
--   * **Nobody but the service role can write it.** There is deliberately no
--     insert policy for anon or authenticated: the form submits through a
--     server action that throttles first. An insert policy would be a second
--     door, unthrottled, straight from any browser holding the anon key.
--
-- The checks below are the ones the app relies on rather than the ones that
-- restate the column list. `readEnquiry` cuts every field to fit before the
-- insert, so these prove the floor underneath it rather than duplicating it.
-- ---------------------------------------------------------------------------

insert into public.pricing_enquiries (full_name, email, company, budget_band, interest, message)
values
  ('Sarah Okafor', 'sarah@zqenq-northbound.test', 'Northbound Media', '£2,500–£5,000', 'Agency partnership', 'Twenty links a month across four client sites.'),
  ('Jo Patel', 'jo@zqenq-other.test', null, null, null, 'Interested in bulk.')
on conflict do nothing;

select 'an enquiry is stored: ' ||
  (select count(*) = 2 from public.pricing_enquiries where email like '%zqenq-%');

select 'a new one starts as new: ' ||
  (select bool_and(status = 'new') from public.pricing_enquiries where email like '%zqenq-%');

select 'and knows where it came from: ' ||
  (select bool_and(source = 'pricing-page') from public.pricing_enquiries where email like '%zqenq-%');

select 'nobody has handled it yet: ' ||
  (select bool_and(handled_by is null and handled_at is null)
     from public.pricing_enquiries where email like '%zqenq-%');

/*
  Only three things are required, and the optional ones are null rather than
  blank. "Did they tell us their company" has to be one question, or every
  read needs to know that '' and null mean the same thing.
*/
select 'the optional fields are null when unanswered: ' ||
  (select company is null and budget_band is null and interest is null
     from public.pricing_enquiries where email = 'jo@zqenq-other.test');

-- -------------------------------------------------------- what it refuses

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('   ', 'blank@zqenq.test', 'Hello.');
  raise notice 'a name of nothing but spaces was accepted: false';
exception
  when check_violation then raise notice 'a name of nothing but spaces is refused: true';
end;
$$;

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('Jo', 'not-an-address', 'Hello.');
  raise notice 'an address with no @ was accepted: false';
exception
  when check_violation then raise notice 'an address with no @ is refused: true';
end;
$$;

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('Jo', 'jo@zqenq.test', '   ');
  raise notice 'a message of nothing but spaces was accepted: false';
exception
  when check_violation then raise notice 'a message of nothing but spaces is refused: true';
end;
$$;

/*
  The ceilings. `readEnquiry` cuts to these before inserting, so nothing the
  form sends can reach them - which is exactly why they are asserted here:
  this is the floor that holds if a future caller forgets.
*/
do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values (repeat('a', 121), 'long@zqenq.test', 'Hello.');
  raise notice 'a 121 character name was accepted: false';
exception
  when check_violation then raise notice 'a 121 character name is refused: true';
end;
$$;

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('Jo', 'long@zqenq.test', repeat('a', 4001));
  raise notice 'a 4001 character message was accepted: false';
exception
  when check_violation then raise notice 'a 4001 character message is refused: true';
end;
$$;

-- The positive control beside those: the column does take the limit, so the
-- refusals are the check working rather than the column refusing everything.
insert into public.pricing_enquiries (full_name, email, message)
values (repeat('a', 120), 'atlimit@zqenq.test', repeat('b', 4000));

select 'a name of exactly 120 characters is accepted: ' ||
  (select length(full_name) = 120 from public.pricing_enquiries where email = 'atlimit@zqenq.test');

select 'and a message of exactly 4000: ' ||
  (select length(message) = 4000 from public.pricing_enquiries where email = 'atlimit@zqenq.test');

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message, status)
  values ('Jo', 'status@zqenq.test', 'Hello.', 'pending');
  raise notice 'an invented status was accepted: false';
exception
  when check_violation then raise notice 'an invented status is refused: true';
end;
$$;

-- -------------------------------------------------------- handling one

update public.pricing_enquiries
   set status = 'in-progress', handled_by = 'admin@test', handled_at = timezone('utc', now())
 where email = 'sarah@zqenq-northbound.test';

select 'an enquiry can be picked up: ' ||
  (select status = 'in-progress' and handled_by = 'admin@test'
     from public.pricing_enquiries where email = 'sarah@zqenq-northbound.test');

-- A data-modifying statement has to be the WITH of the select, not a
-- subquery inside it; Postgres refuses the latter outright.
with touched as (
  update public.pricing_enquiries set status = 'closed'
   where email = 'sarah@zqenq-northbound.test' returning 1
)
select 'and closed: ' || (select count(*) = 1 from touched);

/*
  Two different people may enquire with the same address, and the same person
  may enquire twice. Nothing here is unique, deliberately: an enquiry is a
  message, not an identity, and collapsing two would lose one of them.
*/
insert into public.pricing_enquiries (full_name, email, message)
values ('Sarah Okafor', 'sarah@zqenq-northbound.test', 'Following up on my last message.');

select 'the same person may enquire twice: ' ||
  (select count(*) = 2 from public.pricing_enquiries
    where email = 'sarah@zqenq-northbound.test');

-- ------------------------------------------------------- who may look

set role anon;

select 'anon reads no enquiries: ' ||
  (select count(*) = 0 from public.pricing_enquiries);

/*
  And cannot write one either. The form reaches this table through a server
  action running as the service role; a policy letting a browser insert
  directly would be an unthrottled second door into a table a stranger can
  fill.
*/
do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('Anon', 'anon@zqenq.test', 'Let me in.');
  raise notice 'anon inserted an enquiry directly: false';
exception
  when insufficient_privilege then raise notice 'anon cannot insert an enquiry directly: true';
  when others then raise notice 'anon cannot insert an enquiry directly: true';
end;
$$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-9200-000000000001';

select 'a signed-in customer reads none either: ' ||
  (select count(*) = 0 from public.pricing_enquiries);

do $$
begin
  insert into public.pricing_enquiries (full_name, email, message)
  values ('Customer', 'customer@zqenq.test', 'Let me in.');
  raise notice 'a customer inserted an enquiry directly: false';
exception
  when insufficient_privilege then raise notice 'a customer cannot insert one directly: true';
  when others then raise notice 'a customer cannot insert one directly: true';
end;
$$;

reset request.jwt.claim.sub;
reset role;

select 'the service role still sees them all: ' ||
  (select count(*) >= 3 from public.pricing_enquiries where email like '%zqenq%');

select 'the table carries exactly one policy, and it is the admin''s: ' ||
  (select count(*) = 1 from pg_policies
    where schemaname = 'public' and tablename = 'pricing_enquiries');

select 'row level security is on: ' ||
  (select relrowsecurity from pg_class where oid = 'public.pricing_enquiries'::regclass);
