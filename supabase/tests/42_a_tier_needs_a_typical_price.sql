\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- A tier's typical price.
--
-- The page shipped twice showing one figure on every row, because the
-- cheapest listing clearing DR10 usually clears DR40 too. The median is the
-- fix, so the assertion that matters is that the two numbers differ when the
-- inventory says they should - a fixture with one price per tier would pass
-- against a function that returned the minimum twice.
--
-- ## Why the traffic floor is enormous here
--
-- `tier_price_bands` asks about the whole inventory; it has no niche to
-- scope it to. The seed carries two listings that qualify at the usual
-- floor, so every absolute number below would be a number about the seed
-- and the fixture together - the mistake 40's own comment records making.
-- Those two have 48,000 and 19,000 monthly visits, so a floor of 150,000
-- leaves only the rows this file inserts, and the second call at 110,000 is
-- still clear of them.
-- ---------------------------------------------------------------------------

set role postgres;

insert into public.websites (id, slug, domain, title, status, domain_rating, organic_traffic)
select * from (values
  -- DR 45 and loud: one very cheap, two ordinary. Min 15.00, median 200.00.
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'tb-1', 'tb-one.example', 'TB One', 'active'::public.website_status, 45, 200000),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'tb-2', 'tb-two.example', 'TB Two', 'active'::public.website_status, 45, 200000),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'tb-3', 'tb-three.example', 'TB Three', 'active'::public.website_status, 45, 200000),
  -- Cheapest of all, and below the floor the assertions use.
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'tb-4', 'tb-four.example', 'TB Four', 'active'::public.website_status, 45, 120000),
  -- Every service paused: nothing buyable, however strong or loud.
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'tb-5', 'tb-five.example', 'TB Five', 'active'::public.website_status, 70, 200000)
) as v(id, slug, domain, title, status, domain_rating, organic_traffic)
on conflict (id) do nothing;

insert into public.services (id, website_id, type, price_minor, turnaround_min_days, turnaround_max_days, available)
values
  ('b1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'guest-post', 1500, 3, 7, true),
  ('b1000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'guest-post', 20000, 3, 7, true),
  ('b1000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'guest-post', 30000, 3, 7, true),
  ('b1000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', 'guest-post', 100, 3, 7, true),
  ('b1000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005', 'guest-post', 90000, 3, 7, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------

/*
  The point of the whole migration. Three qualifying listings at 15, 200 and
  300: the cheapest is 1500 minor and the middle is 20000. A function
  returning the minimum for both would satisfy every other assertion here.
*/
select 'the cheapest and the typical are different numbers: ' ||
  (select from_minor = 1500 and median_minor = 20000
     from public.tier_price_bands(150000) where dr_min = 40)::text;

select 'and the tier counts what it priced: ' ||
  (select listings = 3 from public.tier_price_bands(150000) where dr_min = 40)::text;

-- The quiet one is cheaper than everything and must not drag the floor down.
select 'a listing below the readers floor sets no price: ' ||
  (select from_minor = 1500 from public.tier_price_bands(150000) where dr_min = 40)::text;

-- ...and it is the floor doing that, not its rating or its price.
select 'and it is the floor that excluded it: ' ||
  (select from_minor = 100 and listings = 4
     from public.tier_price_bands(110000) where dr_min = 40)::text;

/*
  A paused-only listing is not stock, so DR60 has nothing and the function
  returns no row for it at all.

  Asserted as `count(*) = 0` rather than `listings = 0`: the second reads
  from a row that does not exist, which is null, prints nothing, and is
  counted neither way - so it would vanish from the tally instead of
  failing.
*/
select 'a tier whose only listing is paused is absent, not empty: ' ||
  (select count(*) = 0 from public.tier_price_bands(150000) where dr_min = 60)::text;

-- Tiers are minimums, so a DR 45 listing is in every tier at or below it.
select 'a listing counts in every tier it clears: ' ||
  ((select listings from public.tier_price_bands(150000) where dr_min = 10) =
   (select listings from public.tier_price_bands(150000) where dr_min = 40))::text;

-- ---------------------------------------------------------------------------
-- Who may ask. 0090's lock-down.
-- ---------------------------------------------------------------------------
select 'anon may not ask for the bands: ' ||
  (not has_function_privilege('anon', 'public.tier_price_bands(integer)', 'execute'))::text;

select 'nor a signed-in customer: ' ||
  (not has_function_privilege('authenticated', 'public.tier_price_bands(integer)', 'execute'))::text;

select 'our server may: ' ||
  (has_function_privilege('service_role', 'public.tier_price_bands(integer)', 'execute'))::text;

delete from public.services where website_id in (
  'b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000005');
delete from public.websites where id in (
  'b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000004',
  'b0000000-0000-4000-8000-000000000005');
reset role;
