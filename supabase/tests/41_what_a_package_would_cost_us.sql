\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- What a package would cost us.
--
-- `package_inventory_depth` answers the two questions a managed package has
-- to answer before it can be sold at a fixed fee: can we fill it in this
-- niche, and what will the links cost us.
--
-- The rule worth testing hardest is the one that refuses to answer. Costs are
-- recorded in the publisher's own currency and never converted, so a median
-- across a niche holding both GBP and USD is a figure nobody quoted. The
-- function returns nulls there rather than a number somebody might price
-- against - and a test that only ever fed it one currency would never find
-- out whether it does.
-- ---------------------------------------------------------------------------

set role postgres;

insert into public.categories (slug, name) values ('pkg-niche', 'Pkg Niche')
on conflict (slug) do nothing;
insert into public.categories (slug, name) values ('pkg-mixed', 'Pkg Mixed')
on conflict (slug) do nothing;

insert into public.websites (id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
select * from (values
  -- DR 55, loud. In every tier up to 50.
  ('f0000000-0000-4000-8000-000000000001'::uuid, 'pkg-one', 'pkg-one.example', 'Pkg One', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-niche'), 55, 40000, 'GB', 'measured'),
  -- DR 35. In tiers 10, 20 and 30 only.
  ('f0000000-0000-4000-8000-000000000002'::uuid, 'pkg-two', 'pkg-two.example', 'Pkg Two', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-niche'), 35, 20000, 'US', 'measured'),
  -- DR 65 but almost nobody reads it: below the traffic floor, so in no tier.
  ('f0000000-0000-4000-8000-000000000003'::uuid, 'pkg-three', 'pkg-three.example', 'Pkg Three', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-niche'), 65, 100, 'US', 'measured'),
  -- DR 50, loud, but every service paused: nothing a package could buy.
  ('f0000000-0000-4000-8000-000000000004'::uuid, 'pkg-four', 'pkg-four.example', 'Pkg Four', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-niche'), 50, 30000, 'US', 'measured'),
  -- Two listings in their own niche, costed in DIFFERENT currencies.
  ('f0000000-0000-4000-8000-000000000005'::uuid, 'pkg-five', 'pkg-five.example', 'Pkg Five', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-mixed'), 40, 25000, 'GB', 'measured'),
  ('f0000000-0000-4000-8000-000000000006'::uuid, 'pkg-six', 'pkg-six.example', 'Pkg Six', 'active'::public.website_status,
   (select id from public.categories where slug = 'pkg-mixed'), 40, 25000, 'US', 'measured')
) as v(id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
on conflict (id) do nothing;

-- pkg-two also sits in the mixed niche as a secondary, and is costed in GBP
-- there too - so the mixed niche holds GBP and USD together.
insert into public.website_categories (website_id, category_id)
select 'f0000000-0000-4000-8000-000000000002'::uuid, id
  from public.categories where slug = 'pkg-mixed'
on conflict do nothing;

insert into public.services (id, website_id, type, price_minor, turnaround_min_days, turnaround_max_days, available)
values
  ('a1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'guest-post', 40000, 3, 7, true),
  ('a1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'guest-post', 20000, 3, 7, true),
  ('a1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000003', 'guest-post', 30000, 3, 7, true),
  -- Paused, so pkg-four has nothing buyable.
  ('a1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000004', 'guest-post', 25000, 3, 7, false),
  ('a1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000005', 'guest-post', 22000, 3, 7, true),
  ('a1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000006', 'guest-post', 24000, 3, 7, true)
on conflict (id) do nothing;

insert into public.service_costs (service_id, cost_price_minor) values
  ('a1000000-0000-4000-8000-000000000001', 10000),
  ('a1000000-0000-4000-8000-000000000002', 20000),
  ('a1000000-0000-4000-8000-000000000005', 11000),
  ('a1000000-0000-4000-8000-000000000006', 13000)
on conflict (service_id) do nothing;

insert into public.website_commercials (website_id, cost_currency) values
  ('f0000000-0000-4000-8000-000000000001', 'USD'),
  ('f0000000-0000-4000-8000-000000000002', 'GBP'),
  ('f0000000-0000-4000-8000-000000000005', 'GBP'),
  ('f0000000-0000-4000-8000-000000000006', 'USD')
on conflict (website_id) do update set cost_currency = excluded.cost_currency;

-- ---------------------------------------------------------------------------

-- pkg-one (55) and pkg-two (35) qualify at DR30. pkg-three is too quiet,
-- pkg-four has nothing for sale, so three and four are in no tier at all.
select 'the tier counts the listings a package could be filled from: ' ||
  (select listings = 2 from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 30)::text;

select 'a listing below the rating is not in that tier: ' ||
  (select listings = 1 from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 50)::text;

select 'a listing too quiet to promise traffic on is in no tier: ' ||
  (select count(*) = 0 from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 60)::text;

-- ...and it is the floor doing that, not its rating: drop the floor and the
-- DR 65 listing appears. An assertion the fixture cannot reach otherwise.
select 'and it is the traffic floor that excluded it: ' ||
  (select listings = 1 from public.package_inventory_depth(0)
    where niche = 'pkg-niche' and dr_min = 60)::text;

select 'a listing with every service paused is never counted: ' ||
  (select listings = 2 from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 10)::text;

-- ---------------------------------------------------------------------------
-- The costs.
-- ---------------------------------------------------------------------------

-- One currency in this niche at DR50 - only pkg-one, costed in USD at 10000.
select 'a single-currency tier reports its currency: ' ||
  (select cost_currency = 'USD' from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 50)::text;

select 'and the middle of what those listings cost: ' ||
  (select cost_median_minor = 10000 from public.package_inventory_depth(1000)
    where niche = 'pkg-niche' and dr_min = 50)::text;

/*
  The rule this file exists for. The mixed niche holds pkg-five (GBP),
  pkg-six (USD) and pkg-two (GBP) - so there is no median to report, and a
  number here would be one nobody quoted.
*/
select 'a tier holding two publisher currencies reports no currency: ' ||
  (select cost_currency is null from public.package_inventory_depth(1000)
    where niche = 'pkg-mixed' and dr_min = 30)::text;

select 'and refuses every percentile rather than mixing them: ' ||
  (select cost_low_minor is null and cost_median_minor is null and cost_high_minor is null
     from public.package_inventory_depth(1000)
    where niche = 'pkg-mixed' and dr_min = 30)::text;

-- But it still says how much it could not answer about, so the gap is legible.
select 'while still counting the listings it could not price: ' ||
  (select with_cost = 3 and listings = 3 from public.package_inventory_depth(1000)
    where niche = 'pkg-mixed' and dr_min = 30)::text;

-- What we charge is ours and is always in one currency, so it survives a
-- niche the costs cannot be read across.
select 'our own prices are reported even then: ' ||
  (select sell_median_minor = 22000 from public.package_inventory_depth(1000)
    where niche = 'pkg-mixed' and dr_min = 30)::text;

-- ---------------------------------------------------------------------------
-- Who may ask. 0090's lock-down, and this one reads what we pay.
-- ---------------------------------------------------------------------------
select 'anon may not ask what a package costs us: ' ||
  (not has_function_privilege('anon', 'public.package_inventory_depth(integer)', 'execute'))::text;

select 'nor may a signed-in customer: ' ||
  (not has_function_privilege('authenticated', 'public.package_inventory_depth(integer)', 'execute'))::text;

select 'our server may: ' ||
  (has_function_privilege('service_role', 'public.package_inventory_depth(integer)', 'execute'))::text;

delete from public.service_costs where service_id in (
  'a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000005','a1000000-0000-4000-8000-000000000006');
delete from public.services where website_id in (
  'f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000004',
  'f0000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000006');
delete from public.website_commercials where website_id in (
  'f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000006');
delete from public.website_categories where website_id = 'f0000000-0000-4000-8000-000000000002';
delete from public.websites where id in (
  'f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000004',
  'f0000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000006');
delete from public.categories where slug in ('pkg-niche','pkg-mixed');
reset role;
