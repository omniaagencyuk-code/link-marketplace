\pset tuples_only on
\pset format unaligned

-- Fixtures, created as the owner. The profiles rows appear via the trigger.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin@test'),
  ('22222222-2222-2222-2222-222222222222', 'customer@test');
update public.profiles set role = 'admin' where email = 'admin@test';

insert into public.websites (slug, domain, title, country_code, status, accepted_niches)
values ('cost-test-com', 'cost-test.com', 'Cost Test', 'GB', 'active', '{gambling,cbd}');
insert into public.services (website_id, type, price_minor)
select id, 'guest-post', 30000 from public.websites where slug = 'cost-test-com';
insert into public.service_costs (service_id, cost_price_minor)
select id, 12000 from public.services;

select 'fixtures: profiles=' || (select count(*) from public.profiles)
  || ' websites=' || (select count(*) from public.websites)
  || ' costs=' || (select count(*) from public.service_costs);

-- ---------------------------------------------------------------- as anon
set role anon;
select 'anon sees websites: ' || count(*) from public.websites;
select 'anon sees service_costs: ' || count(*) from public.service_costs;
reset role;

-- ------------------------------------------------- as a signed-in customer
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer sees websites: ' || count(*) from public.websites;
select 'customer sees services: ' || count(*) from public.services;
select 'customer sees service_costs: ' || count(*) from public.service_costs;
select 'customer sees accepted_niches: ' || array_to_string(accepted_niches, ',')
  from public.websites where slug = 'cost-test-com';
reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------- as an admin (Supabase Auth)
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'admin is_admin(): ' || public.is_admin();
select 'admin sees service_costs: ' || count(*) from public.service_costs;
reset role;
reset request.jwt.claim.sub;
