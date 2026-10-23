\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- A publisher offering us their site.
--
-- The form on /list-your-site writes here, which makes this the second table
-- in the schema a stranger can cause a row in - `pricing_enquiries` being the
-- first - and it gets the same two guarantees for the same reasons:
--
--   * **Nobody but an admin can read it.** It holds a named person's address,
--     the site they own and what they want paid for a placement. That last
--     figure is what we would pay, which is `website_niche_costs`-grade and
--     never belongs anywhere a customer can read.
--   * **Nobody but the service role can write it.** There is deliberately no
--     insert policy for anon or authenticated: the form submits through a
--     server action that throttles first. An insert policy would be a second
--     door, unthrottled, straight from any browser holding the anon key.
--
-- The one invariant here that is not in the other table: a price and its
-- currency are stored together or not at all.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, country_code, country_source, status)
values ('zqpub-known-com', 'zqpub-known.com', 'Known Publisher', 'GB', 'stated', 'active')
on conflict do nothing;

insert into public.publisher_submissions
  (full_name, email, domain, placement_type, price_minor, currency, message, matched_website_id)
select
  'Marta Nowak', 'marta@zqpub-known.test', 'zqpub-known.com', 'Guest post', 18000, 'GBP',
  'Happy to do niche edits as well.', id
from public.websites where slug = 'zqpub-known-com'
on conflict do nothing;

insert into public.publisher_submissions (full_name, email, domain)
values ('Tom Reilly', 'tom@zqpub-new.test', 'zqpub-new.com')
on conflict do nothing;

select 'an offer is stored: ' ||
  (select count(*) = 2 from public.publisher_submissions where email like '%zqpub-%');

select 'a new one starts as new: ' ||
  (select bool_and(status = 'new') from public.publisher_submissions where email like '%zqpub-%');

select 'and knows where it came from: ' ||
  (select bool_and(source = 'list-your-site')
     from public.publisher_submissions where email like '%zqpub-%');

select 'nobody has handled it yet: ' ||
  (select bool_and(handled_by is null and handled_at is null)
     from public.publisher_submissions where email like '%zqpub-%');

/*
  Only three things are required. Everything else is null rather than blank,
  so "did they give us a price" is one question rather than two.
*/
select 'the optional fields are null when unanswered: ' ||
  (select placement_type is null and price_minor is null and currency is null
          and message is null and matched_website_id is null
     from public.publisher_submissions where email = 'tom@zqpub-new.test');

-- ------------------------------------------- a price and its currency

select 'a price is stored with its currency: ' ||
  (select price_minor = 18000 and currency = 'GBP'
     from public.publisher_submissions where email = 'marta@zqpub-known.test');

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, price_minor)
  values ('Jo', 'jo@zqpub.test', 'zqpub-jo.com', 15000);
  raise notice 'a price with no currency was accepted: false';
exception
  when check_violation then raise notice 'a price with no currency is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, currency)
  values ('Jo', 'jo@zqpub.test', 'zqpub-jo.com', 'GBP');
  raise notice 'a currency with no price was accepted: false';
exception
  when check_violation then raise notice 'a currency with no price is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, price_minor, currency)
  values ('Jo', 'jo@zqpub.test', 'zqpub-jo.com', 15000, 'CHF');
  raise notice 'a currency we do not price in was accepted: false';
exception
  when check_violation then raise notice 'a currency we do not price in is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, price_minor, currency)
  values ('Jo', 'jo@zqpub.test', 'zqpub-jo.com', 0, 'GBP');
  raise notice 'a price of nothing was accepted: false';
exception
  when check_violation then raise notice 'a price of nothing is refused: true';
end;
$$;

-- -------------------------------------------------------- what it refuses

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values ('   ', 'blank@zqpub.test', 'zqpub-blank.com');
  raise notice 'a name of nothing but spaces was accepted: false';
exception
  when check_violation then raise notice 'a name of nothing but spaces is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values ('Jo', 'not-an-address', 'zqpub-jo.com');
  raise notice 'an address with no @ was accepted: false';
exception
  when check_violation then raise notice 'an address with no @ is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values ('Jo', 'jo@zqpub.test', '  ');
  raise notice 'an offer of no website at all was accepted: false';
exception
  when check_violation then raise notice 'an offer of no website at all is refused: true';
end;
$$;

/*
  The ceilings. `readSubmission` cuts to these before inserting, so nothing
  the form sends can reach them - which is exactly why they are asserted
  here: this is the floor that holds if a future caller forgets.
*/
do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values (repeat('a', 121), 'long@zqpub.test', 'zqpub-jo.com');
  raise notice 'a 121 character name was accepted: false';
exception
  when check_violation then raise notice 'a 121 character name is refused: true';
end;
$$;

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, message)
  values ('Jo', 'long@zqpub.test', 'zqpub-jo.com', repeat('a', 4001));
  raise notice 'a 4001 character message was accepted: false';
exception
  when check_violation then raise notice 'a 4001 character message is refused: true';
end;
$$;

-- The positive control beside those: the columns do take the limit, so the
-- refusals are the checks working rather than the columns refusing anything.
insert into public.publisher_submissions (full_name, email, domain, message)
values (repeat('a', 120), 'atlimit@zqpub.test', 'zqpub-limit.com', repeat('b', 4000));

select 'a name of exactly 120 characters is accepted: ' ||
  (select length(full_name) = 120 from public.publisher_submissions
    where email = 'atlimit@zqpub.test');

select 'and a message of exactly 4000: ' ||
  (select length(message) = 4000 from public.publisher_submissions
    where email = 'atlimit@zqpub.test');

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain, status)
  values ('Jo', 'status@zqpub.test', 'zqpub-jo.com', 'closed');
  raise notice 'an invented status was accepted: false';
exception
  when check_violation then raise notice 'an invented status is refused: true';
end;
$$;

-- ------------------------------------------------- the site it matched

/*
  Losing a listing must not lose the offer that was made against it. The
  match is a convenience for whoever reads the queue - "we already carry
  this one" - and the person's message is the thing that cannot be recreated.
*/
delete from public.websites where slug = 'zqpub-known-com';

select 'deleting the listing leaves the offer standing: ' ||
  (select count(*) = 1 from public.publisher_submissions
    where email = 'marta@zqpub-known.test');

select 'with the match cleared rather than the row: ' ||
  (select matched_website_id is null from public.publisher_submissions
    where email = 'marta@zqpub-known.test');

-- -------------------------------------------------------- handling one

update public.publisher_submissions
   set status = 'listed', handled_by = 'admin@test', handled_at = timezone('utc', now())
 where email = 'marta@zqpub-known.test';

select 'an offer can be taken up: ' ||
  (select status = 'listed' and handled_by = 'admin@test'
     from public.publisher_submissions where email = 'marta@zqpub-known.test');

/*
  The same publisher may write twice, and two people may offer the same site.
  Nothing here is unique, deliberately: a submission is a message, not an
  identity, and collapsing two loses one of them - which is the rule
  `sellerKey` enforces on the email side of the same pipeline.
*/
insert into public.publisher_submissions (full_name, email, domain)
values ('Marta Nowak', 'marta@zqpub-known.test', 'zqpub-known.com');

select 'the same publisher may offer the same site twice: ' ||
  (select count(*) = 2 from public.publisher_submissions
    where email = 'marta@zqpub-known.test');

-- ------------------------------------------------------- who may look

set role anon;

select 'anon reads no offers: ' ||
  (select count(*) = 0 from public.publisher_submissions);

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values ('Anon', 'anon@zqpub.test', 'zqpub-anon.com');
  raise notice 'anon inserted an offer directly: false';
exception
  when insufficient_privilege then raise notice 'anon cannot insert an offer directly: true';
  when others then raise notice 'anon cannot insert an offer directly: true';
end;
$$;

reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-9200-000000000001';

select 'a signed-in customer reads none either: ' ||
  (select count(*) = 0 from public.publisher_submissions);

do $$
begin
  insert into public.publisher_submissions (full_name, email, domain)
  values ('Customer', 'customer@zqpub.test', 'zqpub-customer.com');
  raise notice 'a customer inserted an offer directly: false';
exception
  when insufficient_privilege then raise notice 'a customer cannot insert one directly: true';
  when others then raise notice 'a customer cannot insert one directly: true';
end;
$$;

reset request.jwt.claim.sub;
reset role;

select 'the service role still sees them all: ' ||
  (select count(*) >= 3 from public.publisher_submissions where email like '%zqpub%');

select 'the table carries exactly one policy, and it is the admin''s: ' ||
  (select count(*) = 1 from pg_policies
    where schemaname = 'public' and tablename = 'publisher_submissions');

select 'row level security is on: ' ||
  (select relrowsecurity from pg_class
    where oid = 'public.publisher_submissions'::regclass);
