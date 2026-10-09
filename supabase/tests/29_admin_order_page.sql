\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- One page of the admin order table.
--
-- `/admin/orders` was handed every order and rendered all of them. What
-- replaced that has to do the same job exactly: the same statuses, the same
-- order, a total that counts the filter rather than the page, and a search
-- over what the table actually shows.
--
-- Three of these would pass whatever the function did if they were written
-- the easy way, so they are not. The ordering check names its rows in order
-- rather than counting them. The cap is asserted against a filter that has
-- more rows than the cap. And the "an order appears once" check exists
-- because the obvious way to search a domain - joining `order_items` -
-- returns an order once per item and counts it that many times.
-- ---------------------------------------------------------------------------

-- Two customers. The profile row is made by the trigger on auth.users; the
-- name is set afterwards because the trigger does not know it.
insert into auth.users (id, email) values
  ('00000000-0000-4000-9000-000000000001', 'ao-ada@zqorders.test'),
  ('00000000-0000-4000-9000-000000000002', 'ao-bram@zqorders.test')
on conflict (id) do nothing;

update public.profiles set full_name = 'Ada Lovelace'
 where email = 'ao-ada@zqorders.test';
update public.profiles set full_name = 'Bram Stoker'
 where email = 'ao-bram@zqorders.test';

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values
  ('ao-site-one', 'zqorder-one.test', 'Order Site One', 'active', 'GB', 'stated', 'en'),
  ('ao-site-two', 'zqorder-two.test', 'Order Site Two', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

/*
  Five orders with a timestamp each, so the order is a fact rather than a
  coincidence of insertion.
*/
insert into public.orders (id, reference, user_id, status, total_minor, placed_at)
values
  ('00000000-0000-4000-a000-000000000001', 'ZQO-0001', '00000000-0000-4000-9000-000000000001', 'live',             10000, '2026-01-05T00:00:00Z'),
  ('00000000-0000-4000-a000-000000000002', 'ZQO-0002', '00000000-0000-4000-9000-000000000001', 'draft',             2000, '2026-01-04T00:00:00Z'),
  ('00000000-0000-4000-a000-000000000003', 'ZQO-0003', '00000000-0000-4000-9000-000000000002', 'in-progress',       3000, '2026-01-03T00:00:00Z'),
  ('00000000-0000-4000-a000-000000000004', 'ZQO-0004', '00000000-0000-4000-9000-000000000002', 'cancelled',         4000, '2026-01-02T00:00:00Z'),
  ('00000000-0000-4000-a000-000000000005', 'ZQO-0005', '00000000-0000-4000-9000-000000000002', 'awaiting-content',  5000, '2026-01-01T00:00:00Z')
on conflict (id) do nothing;

-- The first order carries three placements, which is the shape that breaks a
-- join-based search.
insert into public.order_items (id, order_id, website_id, service_type, price_minor, target_url, website_domain, website_slug)
select v.id, v.order_id, w.id, 'guest-post', 1000, 'https://example.test/x', w.domain, w.slug
from (values
  ('00000000-0000-4000-b000-000000000001'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'ao-site-one'),
  ('00000000-0000-4000-b000-000000000002'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'ao-site-one'),
  ('00000000-0000-4000-b000-000000000003'::uuid, '00000000-0000-4000-a000-000000000001'::uuid, 'ao-site-one'),
  ('00000000-0000-4000-b000-000000000004'::uuid, '00000000-0000-4000-a000-000000000003'::uuid, 'ao-site-two')
) as v(id, order_id, slug)
join public.websites w on w.slug = v.slug
on conflict (id) do nothing;

-- ------------------------------------------------------------ the search rule

select 'the reference is searched: ' ||
  (select count(*) = 1 from public.admin_order_page('ZQO-0003', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQO-0003');

select 'the customer name is searched: ' ||
  (select count(*) = 2 from public.admin_order_page('ada lovelace', 'all', 50, 0));

select 'the customer email is searched: ' ||
  (select count(*) = 3 from public.admin_order_page('ao-bram@zqorders.test', 'all', 50, 0));

select 'the website domain is searched: ' ||
  (select count(*) = 1 from public.admin_order_page('zqorder-two.test', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQO-0003');

/*
  The domain searched is the one recorded on the order, not the publisher's
  current one.

  0018 copied the domain onto `order_items` at purchase so that a customer's
  history keeps its domains when a publisher is archived or renamed, and the
  table renders that copy. A search that read `websites` instead would mean
  typing what is on screen and being told there is no such order. Renaming
  the publisher here is what tells the two apart.
*/
update public.websites set domain = 'zqorder-two-renamed.test' where slug = 'ao-site-two';

select 'the domain on the order still finds it after the publisher is renamed: ' ||
  (select count(*) = 1 from public.admin_order_page('zqorder-two.test', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQO-0003');

select 'and the publisher''s new domain does not: ' ||
  (select count(*) = 0 from public.admin_order_page('zqorder-two-renamed.test', 'all', 50, 0));

update public.websites set domain = 'zqorder-two.test' where slug = 'ao-site-two';

/*
  An order with three placements on the same site is one row, not three.

  The straightforward way to search a domain is to join `order_items`, and
  that returns the order once per item: it would appear three times in the
  page and be counted three times in the total. `exists` is why it does not,
  and this is the check that says so.
*/
select 'an order with three placements appears once: ' ||
  (select count(*) = 1 from public.admin_order_page('zqorder-one.test', 'all', 50, 0));

select 'and is counted once in the total: ' ||
  (select coalesce(max(total), -1) = 1 from public.admin_order_page('zqorder-one.test', 'all', 50, 0));

select 'case does not matter: ' ||
  (select count(*) = 1 from public.admin_order_page('zqo-0003', 'all', 50, 0));

select 'surrounding space does not matter: ' ||
  (select count(*) = 1 from public.admin_order_page('   ZQO-0003  ', 'all', 50, 0));

/*
  A search term is input, not a pattern. `%` and `_` are wildcards in a LIKE
  pattern, and `_` turns up in real references and addresses.
*/
select 'a per cent sign is a literal, not a wildcard: ' ||
  (select count(*) = 0 from public.admin_order_page('ZQO%0003', 'all', 50, 0));

select 'an underscore is a literal too: ' ||
  (select count(*) = 0 from public.admin_order_page('ZQO_0003', 'all', 50, 0));

-- -------------------------------------------------------------- the statuses

select 'no status means every status: ' ||
  (select count(*) = 5 from public.admin_order_page('zqo-000', 'all', 50, 0));

select 'a null status means every status too: ' ||
  (select count(*) = 5 from public.admin_order_page('zqo-000', null, 50, 0));

select 'a status narrows it to the orders in it: ' ||
  (select count(*) = 1 and coalesce(min(o.reference), '') = 'ZQO-0003'
   from public.admin_order_page('zqo-000', 'in-progress', 50, 0) p
   join public.orders o on o.id = p.id);

/*
  Draft and cancelled orders are shown.

  The read this replaces had no status filter at all, and the table's
  dropdown offers both. A function that quietly dropped drafts would empty
  that choice - and a draft basket is how somebody sees an order that was
  started and abandoned.
*/
select 'a draft order is matched by "all": ' ||
  (select count(*) = 1 from public.admin_order_page('ZQO-0002', 'all', 50, 0));

select 'and by its own status: ' ||
  (select count(*) = 1 from public.admin_order_page('ZQO-0002', 'draft', 50, 0));

select 'a cancelled order is not lost: ' ||
  (select count(*) = 1 from public.admin_order_page('ZQO-0004', 'cancelled', 50, 0));

-- ------------------------------------------------------------------ the order

/*
  Newest first, then by id.

  The order the full read arrived in, so the table is unchanged by this. The
  tiebreak matters as much as the sort: without it a row can appear on two
  pages and another on none, which reads as an order that has gone missing.
*/
select 'the page is newest first: ' ||
  coalesce((select string_agg(o.reference, ',' order by p.ord)
            from (select id, row_number() over () as ord
                  from public.admin_order_page('zqo-000', 'all', 50, 0)) p
            join public.orders o on o.id = p.id)
           = 'ZQO-0001,ZQO-0002,ZQO-0003,ZQO-0004,ZQO-0005', false)::text ||
  ' (got ' || coalesce((select string_agg(o.reference, ',' order by p.ord)
                        from (select id, row_number() over () as ord
                              from public.admin_order_page('zqo-000', 'all', 50, 0)) p
                        join public.orders o on o.id = p.id), 'nothing') || ')';

-- Four orders sharing a timestamp, so the id tiebreak is the only thing
-- deciding their order. Without it this is whatever the planner felt like.
insert into public.orders (id, reference, user_id, status, total_minor, placed_at)
values
  ('00000000-0000-4000-c000-000000000003', 'ZQT-0003', '00000000-0000-4000-9000-000000000001', 'live', 100, '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-c000-000000000001', 'ZQT-0001', '00000000-0000-4000-9000-000000000001', 'live', 100, '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-c000-000000000004', 'ZQT-0004', '00000000-0000-4000-9000-000000000001', 'live', 100, '2026-02-01T00:00:00Z'),
  ('00000000-0000-4000-c000-000000000002', 'ZQT-0002', '00000000-0000-4000-9000-000000000001', 'live', 100, '2026-02-01T00:00:00Z')
on conflict (id) do nothing;

select 'orders sharing a timestamp come back by id, every time: ' ||
  coalesce((select string_agg(o.reference, ',' order by p.ord)
            from (select id, row_number() over () as ord
                  from public.admin_order_page('zqt-000', 'all', 50, 0)) p
            join public.orders o on o.id = p.id)
           = 'ZQT-0001,ZQT-0002,ZQT-0003,ZQT-0004', false)::text;

-- -------------------------------------------------- paging, and what it totals

/*
  The total counts the filter, not the page.

  This is the number above the table. The read it replaces printed the length
  of its own array, which is how "1000 orders" came to be printed against a
  longer book.
*/
select 'the total is the filter, not the page: ' ||
  (select coalesce(max(total), -1) = 5 from public.admin_order_page('zqo-000', 'all', 2, 0));

select 'and a page returns only its own rows: ' ||
  (select count(*) = 2 from public.admin_order_page('zqo-000', 'all', 2, 0));

select 'the second page continues rather than repeating: ' ||
  ((select coalesce(string_agg(o.reference, ',' order by p.ord), '')
    from (select id, row_number() over () as ord
          from public.admin_order_page('zqo-000', 'all', 2, 2)) p
    join public.orders o on o.id = p.id) = 'ZQO-0003,ZQO-0004')::text;

select 'an offset past the end is empty rather than an error: ' ||
  (select count(*) = 0 from public.admin_order_page('zqo-000', 'all', 2, 500));

/*
  The cap, asserted against a filter that really has more rows than it.

  260 orders, so asking for ten thousand and getting 250 means something. A
  cap checked against five rows is a check that passes with no cap at all,
  which is how 0068's thousand-row ceiling went unnoticed.
*/
insert into public.orders (reference, user_id, status, total_minor, placed_at)
select 'ZQCAP-' || lpad(n::text, 4, '0'),
       '00000000-0000-4000-9000-000000000001',
       'live', 100, '2026-03-01T00:00:00Z'::timestamptz + (n || ' seconds')::interval
from generate_series(1, 260) as n
on conflict (reference) do nothing;

select 'there really are more than the cap to page through: ' ||
  (select coalesce(max(total), -1) = 260 from public.admin_order_page('zqcap-', 'all', 50, 0));

select 'a page size above the cap is cut to the cap: ' ||
  (select count(*) = 250 from public.admin_order_page('zqcap-', 'all', 10000, 0));

select 'a small limit is honoured: ' ||
  (select count(*) = 3 from public.admin_order_page('zqo-000', 'all', 3, 0));

select 'and a negative offset is treated as the start: ' ||
  (select count(*) = 3 from public.admin_order_page('zqo-000', 'all', 3, -5));

-- ------------------------------------------------------- who may call it

/*
  `security definer` makes a function reachable by anyone PostgREST will
  authenticate, and this one reads every customer's orders and their email
  addresses. 0062 found that hole the hard way.
*/
select 'anon cannot call it: ' ||
  (not has_function_privilege('anon', 'public.admin_order_page(text, text, integer, integer)', 'execute'))::text;

select 'nor can a signed-in customer: ' ||
  (not has_function_privilege('authenticated', 'public.admin_order_page(text, text, integer, integer)', 'execute'))::text;
