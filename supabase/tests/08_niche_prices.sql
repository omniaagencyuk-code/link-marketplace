\pset tuples_only on
\pset format unaligned

-- A publisher with a standard rate and a premium on the regulated topics.
insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
select id, 'gambling', 'guest-post', 90000 from public.websites where slug = 'cost-test-com';
insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
select id, 'cbd', 'guest-post', 55000 from public.websites where slug = 'cost-test-com';

select 'overrides stored: ' || count(*) from public.website_niche_prices;

-- Zero is not a price: a free placement is a decision per order, not a rate.
do $$
begin
  insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
  select id, 'crypto', 'guest-post', 0 from public.websites where slug = 'cost-test-com';
  raise notice 'a price of zero was accepted: false';
exception
  when check_violation then raise notice 'a price of zero is refused: true';
end;
$$;

-- One price per niche per placement, so a second import cannot leave two.
do $$
begin
  insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
  select id, 'gambling', 'guest-post', 99900 from public.websites where slug = 'cost-test-com';
  raise notice 'a duplicate override was accepted: false';
exception
  when unique_violation then raise notice 'a duplicate override is refused: true';
end;
$$;

-- ---------------------------------------------------------------- as anon
-- The gate is the point: a price is a fact about a listing, and a signed-out
-- visitor cannot see the listing.
set role anon;
select 'anon reads niche prices: ' || count(*) from public.website_niche_prices;
reset role;

-- ------------------------------------------------- as a signed-in customer
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads niche prices: ' || count(*) from public.website_niche_prices;
select 'customer sees the gambling price: ' || price_minor
  from public.website_niche_prices where niche = 'gambling';

-- A customer must not be able to edit one.
do $$
begin
  update public.website_niche_prices set price_minor = 100 where niche = 'gambling';
  if found then raise notice 'customer edited a price: true';
  else raise notice 'customer edit changed nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'customer edit refused outright: true';
end;
$$;
select 'price after the customer tried: ' || price_minor
  from public.website_niche_prices where niche = 'gambling';
reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------------------- as an admin
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update public.website_niche_prices set price_minor = 95000 where niche = 'gambling';
select 'admin edited the price: ' || price_minor
  from public.website_niche_prices where niche = 'gambling';
reset role;
reset request.jwt.claim.sub;

-- Deleting the website takes its prices with it.
delete from public.website_niche_prices;
insert into public.websites (slug, domain, title, country_code, status)
values ('cascade-test-com', 'cascade-test.com', 'Cascade', 'GB', 'draft');
insert into public.website_niche_prices (website_id, niche, link_type, price_minor)
select id, 'gambling', 'guest-post', 50000 from public.websites where slug = 'cascade-test-com';
delete from public.websites where slug = 'cascade-test-com';
select 'prices cascade with the website: ' || (count(*) = 0) from public.website_niche_prices;
