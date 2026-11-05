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
insert into public.websites (id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
select * from (values
  -- Primary business. Counted and listed under business.
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'np-one', 'np-one.example', 'NP One', 'active'::public.website_status,
   (select id from public.categories where slug = 'business'), 61, 48000, 'GB', 'measured'),
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
   (select id from public.categories where slug = 'business'), 70, 90000, 'GB', 'measured'),
  /*
    In business, with a country nobody established and no services. Two
    things in one row because both need a listing that is actually IN the
    niche: an assertion about a row the function does not return is
    `bool_and` over nothing, which is null, prints nothing, and is counted
    neither way - so it vanishes from the tally instead of failing.
  */
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'np-five', 'np-five.example', 'NP Five', 'active'::public.website_status,
   (select id from public.categories where slug = 'business'), 20, 3000, 'FR', 'default')
) as v(id, slug, domain, title, status, primary_category_id, domain_rating, organic_traffic, country_code, country_source)
on conflict (id) do nothing;

insert into public.website_categories (website_id, category_id)
select 'd0000000-0000-4000-8000-000000000002'::uuid, id
  from public.categories where slug = 'business'
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

select 'a listing in the niche is returned: ' ||
  (select count(*) = 1 from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000001')::text;

-- The rule `niche_page_counts` exists to get right, asserted on this side too.
select 'a secondary niche counts as being in it: ' ||
  (select count(*) = 1 from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000002')::text;

select 'and it is still in its primary: ' ||
  (select count(*) = 1 from public.niche_page_listings('finance') l
    where l.id = 'd0000000-0000-4000-8000-000000000002')::text;

-- 0077. A listing nobody categorised is in no niche, not in technology.
select 'an uncategorised listing is in no niche: ' ||
  (select count(*) = 0 from public.niche_page_listings('technology') l
    where l.id = 'd0000000-0000-4000-8000-000000000003')::text;

select 'a paused listing is in none either: ' ||
  (select count(*) = 0 from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000004')::text;

-- The services travel with the row, because the price rule is applied to
-- them in TypeScript rather than reimplemented as a min() here.
select 'the services come back with the listing: ' ||
  (select jsonb_array_length(l.services) = 2 from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000001')::text;

select 'including whether each one is available: ' ||
  (select bool_and(entry ? 'available' and entry ? 'price_minor' and entry ? 'type')
     from public.niche_page_listings('business') l,
          jsonb_array_elements(l.services) entry
    where l.id = 'd0000000-0000-4000-8000-000000000001')::text;

-- `jsonb_agg` over no rows is null, not '[]', so the coalesce is the only
-- thing standing between the caller and two shapes to handle.
select 'a listing with no services gets an empty array, never null: ' ||
  (select l.services = '[]'::jsonb from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000005')::text;

/*
  A country whose source is 'default' is not a country - the view's rule,
  and the reason the page reads from the view rather than from `websites`.
  np-five carries 'FR' with source 'default', so the column is set and the
  answer is still null.
*/
select 'a defaulted country is not reported as one: ' ||
  (select l.country is null from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000005')::text;

select 'while a measured one is: ' ||
  (select l.country = 'GB' from public.niche_page_listings('business') l
    where l.id = 'd0000000-0000-4000-8000-000000000001')::text;

-- ---------------------------------------------------------------------------
-- The one that matters: the rule that publishes a page and the rule that
-- fills it must return the same number, for every niche, always.
-- ---------------------------------------------------------------------------
select 'every niche counts the same both ways: ' ||
  (select bool_and(c.listings = (select count(*) from public.niche_page_listings(c.niche)))
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

select 'and so does the niche page: ' ||
  (select count(*) = 0 from public.niche_page_listings('technology') l
    where l.id = 'd0000000-0000-4000-8000-000000000003')::text;

-- Both of those are true of a listing in no niche whatever the rule, so one
-- that IS in a niche proves the comparison can fail.
select 'while both find a listing that is in one: ' ||
  ((select count(*) = 1 from public.marketplace_niche_preview('business', 6) p
     where p.id = 'd0000000-0000-4000-8000-000000000001')
   and (select count(*) = 1 from public.niche_page_listings('business') l
     where l.id = 'd0000000-0000-4000-8000-000000000001'))::text;

-- ---------------------------------------------------------------------------
-- Who may call it. 0090's lock-down, which 0093 repeated and this follows.
-- ---------------------------------------------------------------------------
select 'anon may not call it: ' ||
  (not has_function_privilege('anon', 'public.niche_page_listings(text)', 'execute'))::text;

select 'nor may a signed-in customer: ' ||
  (not has_function_privilege('authenticated', 'public.niche_page_listings(text)', 'execute'))::text;

select 'our server may: ' ||
  has_function_privilege('service_role', 'public.niche_page_listings(text)', 'execute')::text;

delete from public.services where website_id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002'
);
delete from public.website_categories where website_id = 'd0000000-0000-4000-8000-000000000002';
delete from public.websites where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003',
  'd0000000-0000-4000-8000-000000000004',
  'd0000000-0000-4000-8000-000000000005'
);
reset role;
