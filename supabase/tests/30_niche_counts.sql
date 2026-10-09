\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The homepage's niche counts.
--
-- These are the numbers on the niche cards: the figures a stranger judges the
-- size of the business by. They were produced by reading every active listing
-- and counting the rows in JavaScript, and the risk in moving that into SQL
-- is not that it breaks loudly - it is that it returns a slightly different
-- number and nothing says so.
--
-- So each check names what the JavaScript did and asserts the same thing:
-- only active listings, only the primary category, one row per listing, and a
-- niche with nothing in it absent rather than zero.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, primary_category_id)
select v.slug, v.domain, v.title, v.status::public.website_status, 'GB', 'stated', 'en', c.id
from (values
  ('nc-one',   'zqniche-one.test',   'NC One',   'active',   'igaming'),
  ('nc-two',   'zqniche-two.test',   'NC Two',   'active',   'igaming'),
  ('nc-three', 'zqniche-three.test', 'NC Three', 'active',   'finance'),
  ('nc-four',  'zqniche-four.test',  'NC Four',  'draft',    'igaming'),
  ('nc-five',  'zqniche-five.test',  'NC Five',  'paused',   'finance'),
  ('nc-six',   'zqniche-six.test',   'NC Six',   'archived', 'finance')
) as v(slug, domain, title, status, niche)
join public.categories c on c.slug = v.niche
on conflict (slug) do nothing;

-- A listing with no primary category at all. The JavaScript skipped it: it
-- read the joined slug and did `if (!slug) continue`.
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values ('nc-none', 'zqniche-none.test', 'NC None', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

-- A secondary category, which the count never looked at. `countByNiche`
-- read `primary_category` only, so a listing filed under finance as well as
-- igaming counted once, under igaming.
insert into public.website_categories (website_id, category_id)
select w.id, c.id
from public.websites w, public.categories c
where w.slug = 'nc-one' and c.slug = 'finance'
on conflict do nothing;

select 'active listings are counted: ' ||
  (select coalesce(max(listings), -1) = 2
   from public.marketplace_niche_counts() where niche = 'igaming');

/*
  A draft, a paused and an archived listing are not on the marketplace, and
  the count behind a public figure must not include them. `nc-four` is a
  draft in igaming, so igaming reading 3 above would be this check failing.
*/
select 'a draft listing is not counted: ' ||
  (select coalesce(max(listings), -1) = 1
   from public.marketplace_niche_counts() where niche = 'finance');

select 'and the count is the same whichever way it is asked: ' ||
  (select count(*) = 1 from public.marketplace_niche_counts() where niche = 'finance');

/*
  One row per listing, not one per category it belongs to.

  `nc-one` is in igaming as its primary and finance as a secondary. Joining
  `website_categories` instead of the primary would count it twice - igaming
  3 and finance 2 - which is the mistake that makes a homepage figure larger
  than the inventory.
*/
select 'a second category does not count the listing twice: ' ||
  (select coalesce(max(listings), -1) = 2
   from public.marketplace_niche_counts() where niche = 'igaming');

select 'nor add it to the other niche: ' ||
  (select coalesce(max(listings), -1) = 1
   from public.marketplace_niche_counts() where niche = 'finance');

/*
  A listing with no primary category is skipped, not counted under an empty
  key. The JavaScript did `if (!slug) continue`, and a null slug arriving
  here would render as a niche card with no name.
*/
select 'a listing with no niche is skipped: ' ||
  (select count(*) = 0 from public.marketplace_niche_counts() where niche is null);

/*
  A niche with nothing in it is absent rather than zero.

  The JavaScript built the record by incrementing as it went, so an empty
  niche simply never got a key. The cards read that record, so a niche that
  arrived as 0 instead of missing would change what the homepage draws.
*/
select 'an empty niche is absent rather than zero: ' ||
  (select count(*) = 0 from public.marketplace_niche_counts() where listings = 0);

-- Every row carries a real category slug, which is what the cards index on.
select 'every niche returned is a real category: ' ||
  (select count(*) = 0
   from public.marketplace_niche_counts() n
   where not exists (select 1 from public.categories c where c.slug = n.niche));

-- --------------------------------------------------------- who may call it

/*
  The homepage is public and a signed-out visitor cannot read `websites`
  directly - that gate is 0006. This has to be callable by anon for the page
  to draw, and it is safe to be, because it selects no column of a listing.
*/
select 'anon may count the niches: ' ||
  has_function_privilege('anon', 'public.marketplace_niche_counts()', 'execute')::text;

select 'and so may a signed-in customer: ' ||
  has_function_privilege('authenticated', 'public.marketplace_niche_counts()', 'execute')::text;
