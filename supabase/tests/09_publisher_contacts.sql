\pset tuples_only on
\pset format unaligned

-- The publisher's address is the thing a customer could use to go around the
-- marketplace entirely, so it gets the same proof the cost prices get: not
-- "the UI does not show it", but "the database will not hand it over".

-- ------------------------------------------------------------- as an admin
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.website_contacts (website_id, email, contact_name, notes, updated_by)
select id, 'editor@cost-test.com', 'Dana Reeve', 'Invoices monthly, chase on the 1st.', 'admin@test'
from public.websites where slug = 'cost-test-com';

select 'admin stored a contact: ' || count(*) from public.website_contacts;

-- The shape check is deliberately loose, but it is not nothing: a value that
-- could never be emailed is a typo, and a typo here means an order that
-- silently never gets placed.
do $$
begin
  insert into public.website_contacts (website_id, email)
  select id, 'not-an-address' from public.websites where slug = 'cost-test-com';
  raise notice 'a malformed address was accepted: true';
exception
  when check_violation then raise notice 'a malformed address is refused: true';
  when unique_violation then raise notice 'a malformed address reached the key first: unclear';
end;
$$;

-- One contact per website: the primary key, so a re-import updates rather
-- than leaving two addresses and a guess about which one is current.
do $$
begin
  insert into public.website_contacts (website_id, email)
  select id, 'second@cost-test.com' from public.websites where slug = 'cost-test-com';
  raise notice 'a second contact was accepted: true';
exception
  when unique_violation then raise notice 'a second contact for one website is refused: true';
end;
$$;

reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------- as anon
-- A signed-out visitor cannot see the marketplace at all; they certainly
-- cannot see who we buy from.
set role anon;
select 'anon reads website_contacts: ' || count(*) from public.website_contacts;
select 'anon reads any email: ' || coalesce(
  (select string_agg(email, ',') from public.website_contacts), 'none');
reset role;

-- ------------------------------------------------- as a signed-in customer
-- The case that matters. A customer CAN read `websites` - that is the
-- marketplace - so the only thing standing between them and the publisher's
-- address is this table having no policy for them.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select 'customer sees the website: ' || count(*)
  from public.websites where slug = 'cost-test-com';
select 'customer reads website_contacts: ' || count(*) from public.website_contacts;
select 'customer reads any email: ' || coalesce(
  (select string_agg(email, ',') from public.website_contacts), 'none');

-- The same query PostgREST runs for an embed, `websites?select=*,website_contacts(*)`.
-- It must come back empty rather than carrying the address out with the listing.
select 'customer embed returns an address: ' || coalesce(c.email, 'none')
  from public.websites w
  left join public.website_contacts c on c.website_id = w.id
 where w.slug = 'cost-test-com';

-- Nor can they write one, which would otherwise be a way to make the table
-- speak: insert a row and read back what conflicts.
do $$
begin
  insert into public.website_contacts (website_id, email)
  select id, 'attacker@example.com' from public.websites where slug = 'cost-test-com';
  raise notice 'customer inserted a contact: true';
exception
  when insufficient_privilege then raise notice 'customer insert refused outright: true';
  when unique_violation then raise notice 'customer insert leaked the row through the key: true';
end;
$$;

do $$
begin
  update public.website_contacts set email = 'attacker@example.com';
  if found then raise notice 'customer edited a contact: true';
  else raise notice 'customer edit changed nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'customer edit refused outright: true';
end;
$$;

do $$
begin
  delete from public.website_contacts;
  if found then raise notice 'customer deleted a contact: true';
  else raise notice 'customer delete removed nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'customer delete refused outright: true';
end;
$$;

reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------------------- as an admin
-- And the address survived all of that unchanged.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'admin reads the address: ' || email from public.website_contacts;
select 'admin reads the internal note: ' || notes from public.website_contacts;
reset role;
reset request.jwt.claim.sub;

-- Removing a listing takes its contact with it: an address we hold because of
-- a website is not something to keep once the website is gone.
insert into public.websites (slug, domain, title, country_code, status)
values ('contact-cascade-com', 'contact-cascade.com', 'Cascade', 'GB', 'draft');
insert into public.website_contacts (website_id, email)
select id, 'gone@contact-cascade.com' from public.websites where slug = 'contact-cascade-com';
delete from public.websites where slug = 'contact-cascade-com';
select 'contacts cascade with the website: ' || (count(*) = 0)
  from public.website_contacts where email = 'gone@contact-cascade.com';
