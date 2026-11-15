\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The two questions a niche page asks, and whether they agree.
--
-- /guest-posts/<niche> asks `niche_page_counts` whether the niche is big
-- enough to have a page, and `niche_page_listings` what is in it. If those
-- two ever disagree the page is published by one rule and rendered by
-- another, which shows up as a 404 on a URL in the sitemap - reported back
-- as a crawl error, with nothing in the logs and nothing to reproduce.
--
-- They are two expressions of `inNiche` - counts groups every listing by all
-- of its niches, listings filters one niche - so they can drift. The last
-- assertion below walks every niche in the fixture and compares them.
--
-- There is a third rule on the same page, `marketplace_niche_preview`, and
-- it is checked here too. Reading 0073 alone says it disagrees - that
-- definition carries `coalesce(pc.slug, 'technology')`, which 0077 took out.
-- It does not: 0077 redefines the function and the last definition is the
-- one that exists. This file is where that is established rather than
-- re-derived from a migration that has been superseded.
-- ---------------------------------------------------------------------------

set role postgres;

/*
  Four listings, chosen so that each rule has something to get wrong.

  The categories are looked up rather than inserted: `categories.slug` is
  unique and the seed already carries business and finance, so inserting
  them here fails and every row that references them fails after it - which
  is how the first run of this file reported the function broken when the
  fixture was.
*/
/*
  A niche of this fixture's own.

  The first version counted `business`, which the seed and the other tests
  also populate - so every absolute number here was a number about the whole
  database, and the assertions failed on data they were never about.
*/
insert into public.categories (slug, name) values ('np-niche', 'NP Niche')
on conflict (slug) do nothing;

insert into public.websites (id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
select * from (values
  -- Primary business. Counted and listed under business.
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'np-one', 'np-one.example', 'NP One', 'active'::public.website_status,
   (select id from public.categories where slug = 'np-niche'), 61, 48000, 'GB', 'measured'),
  -- Primary finance, secondary business. Must appear under BOTH - the bug
  -- 0093 records is a listing counted only under its primary.
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'np-two', 'np-two.example', 'NP Two', 'active'::public.website_status,
   (select id from public.categories where slug = 'finance'), 44, 19000, 'US', 'measured'),
  /*
    No category at all. 0077: it belongs to no niche, and is not technology.
    Both country columns null, because `websites_country_needs_a_source`
    requires them to agree.
  */
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'np-three', 'np-three.example', 'NP Three', 'active'::public.website_status,
   null, 33, 12000, null, null),
  -- Paused, and in business. Neither rule may see it.
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'np-four', 'np-four.example', 'NP Four', 'paused'::public.website_status,
   (select id from public.categories where slug = 'np-niche'), 70, 90000, 'GB', 'measured'),
  /*
    In business, with a country nobody established and no services. Two
    things in one row because both need a listing that is actually IN the
    niche: an assertion about a row the function does not return is
    `bool_and` over nothing, which is null, prints nothing, and is counted
    neither way - so it vanishes from the tally instead of failing.
  */
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'np-five', 'np-five.example', 'NP Five', 'active'::public.website_status,
   (select id from public.categories where slug = 'np-niche'), 20, 3000, 'FR', 'default')
) as v(id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
on conflict (id) do nothing;

insert into public.website_categories (website_id, category_id)
select 'd0000000-0000-4000-8000-000000000002'::uuid, id
  from public.categories where slug = 'np-niche'
on conflict do nothing;

insert into public.services (id, website_id, type, price_minor, turnaround_min_days, turnaround_max_days, available)
values
  -- Two services, the cheaper one paused: `pricedServices` takes the
  -- available one, so the lowest price here is 22000 and not 9900.
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'guest-post', 22000, 3, 7, true),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001',
   'niche-edit', 9900, 3, 7, false),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002',
   'guest-post', 14000, 3, 7, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------

/*
  Three active listings: np-one (primary), np-two (secondary) and np-five.
  np-four is paused and np-three has no category at all, so a count of four
  would mean a paused listing counted, and a different rule for secondaries
  would give two.
*/
select 'the niche counts its primaries, its secondaries and nothing else: ' ||
  (select listings = 3 from public.niche_page_stats('np-niche'))::text;

select 'and a listing in two niches is in both: ' ||
  ((select listings = 3 from public.niche_page_stats('np-niche'))
   and (select count(*) = 1 from public.niche_page_samples('np-niche', 10, 0) s
          where s.domain_rating = 44))::text;

/*
  The price rule, which `verify:niche-pages` checks against the TypeScript
  and which is checked here for the one case a reader would doubt: np-one
  has an available service at 22,000 and a paused one at 9,900, so its own
  lowest price is 22,000 - a paused service is not a price anybody can buy.
*/
select 'a paused service is not the lowest price: ' ||
  (select starting_price_minor = 14000 from public.niche_page_stats('np-niche'))::text;

/*
  A country whose source is 'default' is not a country - the view's rule,
  and the reason the page reads from the view rather than from `websites`.
  np-five carries 'FR' with source 'default'.
*/
select 'a defaulted country is not counted as a market: ' ||
  (select countries = 2 from public.niche_page_stats('np-niche'))::text;

-- The sample takes only listings loud enough and priced. np-five has no
-- services, so it is counted in the band and never shown as an example.
select 'an unpriced listing is counted but never sampled: ' ||
  ((select listings from public.niche_page_stats('np-niche')) = 3
   and (select count(*) from public.niche_page_samples('np-niche', 10, 0)) = 2)::text;

select 'and the traffic floor keeps the quiet ones out: ' ||
  (select count(*) = 0 from public.niche_page_samples('np-niche', 10, 100000))::text;

-- ---------------------------------------------------------------------------
-- The one that matters: the rule that publishes a page and the rule that
-- fills it must return the same number, for every niche, always.
-- ---------------------------------------------------------------------------
select 'every niche counts the same both ways: ' ||
  (select bool_and(c.listings = (select listings from public.niche_page_stats(c.niche)))
     from public.niche_page_counts() c)::text;

-- And that the fixture actually exercised that - a comparison over no rows
-- is `bool_and` returning null, which prints nothing and is counted neither
-- way, so the assertion above would vanish rather than fail.
select 'and there was more than one niche to compare: ' ||
  (select count(*) >= 2 from public.niche_page_counts())::text;

-- ---------------------------------------------------------------------------
-- The third rule on the page agrees as well.
-- ---------------------------------------------------------------------------
select 'the preview reads a missing category the same way: ' ||
  (select count(*) = 0 from public.marketplace_niche_preview('technology', 6) p
    where p.id = 'd0000000-0000-4000-8000-000000000003')::text;

-- Said about this fixture's own niche, where the number is known.
select 'and the band counts the same three: ' ||
  ((select count(*) from public.marketplace_niche_preview('np-niche', 50)) = 3
   and (select listings = 3 from public.niche_page_stats('np-niche')))::text;

-- ---------------------------------------------------------------------------
-- Who may call them. 0090's lock-down, which 0093 repeated and this follows.
-- ---------------------------------------------------------------------------
select 'anon may not call the band: ' ||
  (not has_function_privilege('anon', 'public.niche_page_stats(text)', 'execute'))::text;

select 'nor the sample: ' ||
  (not has_function_privilege('anon', 'public.niche_page_samples(text,integer,integer)', 'execute'))::text;

select 'nor may a signed-in customer call either: ' ||
  (not has_function_privilege('authenticated', 'public.niche_page_stats(text)', 'execute')
   and not has_function_privilege('authenticated', 'public.niche_page_samples(text,integer,integer)', 'execute'))::text;

select 'our server may call both: ' ||
  (has_function_privilege('service_role', 'public.niche_page_stats(text)', 'execute')
   and has_function_privilege('service_role', 'public.niche_page_samples(text,integer,integer)', 'execute'))::text;

-- The row-returning function 0097 replaced is gone, not left beside them.
select 'the read it replaced no longer exists: ' ||
  (select count(*) = 0 from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'niche_page_listings')::text;

delete from public.services where website_id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002'
);
delete from public.website_categories where website_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.categories where slug = 'np-niche';
delete from public.websites where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000004',
  'd0000000-0000-4000-8000-000000000005'
);
reset role;
