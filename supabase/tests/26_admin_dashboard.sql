\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The admin dashboard's arithmetic.
--
-- These replace a page that read every listing, every order and every profile
-- and counted them in JavaScript. What matters is that they count the same
-- things: the revenue rule in particular is not re-decided here, and a
-- dashboard quietly including draft baskets in revenue is a number somebody
-- reports to an accountant.
--
-- Fixtures are scoped by a distinctive reference, and the assertions count
-- the fixtures rather than the whole database - a check against a global
-- total stops testing the moment anything else inserts a row.
-- ---------------------------------------------------------------------------

/*
  The profile rows are made by the trigger, not by this file.

  `handle_new_user` copies the address out of `auth.users` into `profiles`,
  so inserting a user with no email fails the profile's not-null column - and
  inserting the profile directly fights the trigger that already made one.
  This is the shape every other test here uses.
*/
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'dash-one@test.test'),
  ('00000000-0000-4000-a000-000000000002', 'dash-two@test.test')
on conflict (id) do nothing;

update public.profiles set full_name = 'Dash One', role = 'customer'
 where email = 'dash-one@test.test';
-- Left nameless on purpose: the list falls back to the address.
update public.profiles set full_name = '', role = 'customer'
 where email = 'dash-two@test.test';

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values ('dash-site', 'dash-site.test', 'Dash', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

/*
  Six orders, one per status, all on the same day, all for the same money.

  One of each means every exclusion is exercised by exactly one row, so a
  rule that lets the wrong status through moves the total by a known amount
  rather than by an amount that might be a rounding difference.
*/
insert into public.orders (reference, user_id, status, total_minor, placed_at)
values
  ('DASH-LIVE',   '00000000-0000-4000-a000-000000000001', 'live',             10000, '2026-06-15T10:00:00Z'),
  ('DASH-PROG',   '00000000-0000-4000-a000-000000000001', 'in-progress',      10000, '2026-06-15T11:00:00Z'),
  ('DASH-AWAIT',  '00000000-0000-4000-a000-000000000002', 'awaiting-content', 10000, '2026-06-15T12:00:00Z'),
  ('DASH-SUB',    '00000000-0000-4000-a000-000000000002', 'submitted',        10000, '2026-06-15T13:00:00Z'),
  ('DASH-CANX',   '00000000-0000-4000-a000-000000000001', 'cancelled',        10000, '2026-06-15T14:00:00Z'),
  ('DASH-DRAFT',  '00000000-0000-4000-a000-000000000001', 'draft',            10000, '2026-06-15T15:00:00Z')
on conflict (reference) do nothing;

-- One in the month before, for the "compared with the period before" figure.
insert into public.orders (reference, user_id, status, total_minor, placed_at)
values ('DASH-PREV', '00000000-0000-4000-a000-000000000001', 'live', 25000, '2026-05-20T10:00:00Z')
on conflict (reference) do nothing;

-- ------------------------------------------------------------- the totals

/*
  Four of the six count, and the two that do not are the rule.

  A draft is a basket nobody has paid for; a cancelled order is money that
  never arrived. Both were already excluded by the page this replaces, and
  this is the check that says the database now excludes the same two.
*/
select 'four of the six orders count towards revenue: ' ||
  (select orders_in_range = 4
   from public.admin_dashboard_totals('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'));

select 'and the revenue is theirs alone: ' ||
  (select revenue_in_range = 40000
   from public.admin_dashboard_totals('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'));

select 'the cancelled order is not in it: ' ||
  (select revenue_in_range <> 50000
   from public.admin_dashboard_totals('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'));

select 'nor is the draft: ' ||
  (select revenue_in_range <> 60000
   from public.admin_dashboard_totals('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'));

select 'the preceding period is the same length, immediately before: ' ||
  (select revenue_previous = 25000
   from public.admin_dashboard_totals('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z'));

/*
  All time has nothing before it.

  A percentage change against an unbounded range is a number with no meaning,
  and the card must be able to tell the difference between "no change" and
  "nothing to compare with".
*/
select 'an unbounded range reports no preceding period: ' ||
  (select orders_previous = 0 and revenue_previous = 0
   from public.admin_dashboard_totals(null, null));

select 'and still counts everything in it: ' ||
  (select orders_in_range >= 5 from public.admin_dashboard_totals(null, null));

select 'customers are counted, not every profile: ' ||
  (select customers >= 2 from public.admin_dashboard_totals(null, null));

select 'active listings and all listings are different numbers: ' ||
  (select websites_total > websites_active from public.admin_dashboard_totals(null, null));

-- -------------------------------------------------------------- the series

select 'a day with orders carries their total: ' ||
  (select revenue_minor = 40000
   from public.admin_revenue_series('2026-06-15T00:00:00Z', '2026-06-15T23:00:00Z')
   where day = date '2026-06-15');

/*
  The empty days are in it.

  A chart drawn from only the days that had an order joins the dots across
  the ones that did not, and shows a smooth line through a week when nothing
  sold. These rows are what stop that.
*/
select 'the days with none are still rows: ' ||
  (select count(*) = 5
   from public.admin_revenue_series('2026-06-13T00:00:00Z', '2026-06-17T00:00:00Z'));

select 'and they are zero rather than missing: ' ||
  (select revenue_minor = 0 and orders = 0
   from public.admin_revenue_series('2026-06-13T00:00:00Z', '2026-06-17T00:00:00Z')
   where day = date '2026-06-14');

select 'the series excludes the same two statuses: ' ||
  (select sum(revenue_minor) = 40000
   from public.admin_revenue_series('2026-06-15T00:00:00Z', '2026-06-15T23:00:00Z'));

-- ------------------------------------------------------------ the statuses

/*
  Asserted over a range with no orders in it at all.

  Counting six against the whole database proves nothing: these tests insert
  one order of every status, so a function building its list from the rows it
  found returns six as well. A window containing nothing is the only question
  the two implementations answer differently - the enum still has six labels,
  and the rows have none.
*/
select 'a range with no orders still lists every status: ' ||
  (select count(*) = 6
   from public.admin_orders_by_status('2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z'));

select 'and every one of them at zero: ' ||
  (select coalesce(sum(orders), -1) = 0
   from public.admin_orders_by_status('2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z'));

select 'every status is listed, including the empty ones: ' ||
  (select count(*) = 6 from public.admin_orders_by_status(null, null));

select 'a status with orders carries its count: ' ||
  (select orders >= 1 from public.admin_orders_by_status(null, null) where status = 'live');

/*
  Cancelled appears here, unlike in revenue.

  The chart is a breakdown of orders rather than of money, and an admin
  looking at why last month was quiet needs to see the cancellations. The two
  functions differ on purpose and this is the line that records it.
*/
select 'cancelled orders are shown in the breakdown: ' ||
  (select orders = 1 from public.admin_orders_by_status('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z')
   where status = 'cancelled');

-- ------------------------------------------------- categories and the list

select 'a category with no active listings is left out: ' ||
  (select count(*) = 0 from public.admin_top_categories(50) where websites = 0);

select 'the recent list leaves out drafts: ' ||
  (select count(*) = 0 from public.admin_recent_orders(25) where reference = 'DASH-DRAFT');

select 'and shows the orders: ' ||
  (select count(*) >= 1 from public.admin_recent_orders(25) where reference = 'DASH-LIVE');

select 'a customer with no name falls back to their address: ' ||
  (select customer = 'dash-two@test.test'
   from public.admin_recent_orders(25) where reference = 'DASH-AWAIT');

select 'and one with a name uses it: ' ||
  (select customer = 'Dash One'
   from public.admin_recent_orders(25) where reference = 'DASH-LIVE');

select 'the list is capped: ' ||
  (select count(*) <= 25 from public.admin_recent_orders(100000));

-- ------------------------------------------------------------- the queues

select 'the queue counts answer without error: ' ||
  (select drafts_pending >= 0 and duplicate_domains >= 0 and publishable >= 0
   from public.admin_queue_counts());

-- ------------------------------------------------- who may call these at all

do $$
declare
  fn text;
  r text;
  v_refused boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach fn in array array[
      'select * from public.admin_dashboard_totals(null, null)',
      'select * from public.admin_revenue_series(now(), now())',
      'select * from public.admin_orders_by_status(null, null)',
      'select * from public.admin_top_categories(5)',
      'select * from public.admin_recent_orders(5)',
      'select * from public.admin_queue_counts()'
    ] loop
      v_refused := false;
      begin
        execute format('set local role %I', r);
        execute fn;
      exception when insufficient_privilege then
        v_refused := true;
      end;
      reset role;
      raise notice '% is refused: % -> %', r, left(fn, 44), v_refused;
    end loop;
  end loop;
end;
$$;

-- ------------------------------------------------- the admin user list (0071)

/*
  The two figures beside each account.

  The page worked them out by filtering every order once per user; this is
  the same arithmetic in one grouped join, and the same exclusions. A test
  that only checked the count would miss the exclusions, which are the part
  that moves money on screen.
*/
/*
  Customer one placed five orders: live, in progress, cancelled, draft, and
  one live in the month before. Three of them count, for 45,000.
*/
select 'an account carries its own order count: ' ||
  (select orders = 3 from public.admin_user_rows() where email = 'dash-one@test.test');

select 'and its own spend: ' ||
  (select spend_minor = 45000 from public.admin_user_rows() where email = 'dash-one@test.test');

-- 55,000 would mean the cancelled one came too; 65,000, the draft as well.
select 'the cancelled order is not in it: ' ||
  (select spend_minor <> 55000 from public.admin_user_rows() where email = 'dash-one@test.test');

select 'nor is the draft: ' ||
  (select spend_minor <> 65000 from public.admin_user_rows() where email = 'dash-one@test.test');

-- And the other customer's orders are not in it either.
select 'one account''s figures are not another''s: ' ||
  (select orders = 2 and spend_minor = 20000
   from public.admin_user_rows() where email = 'dash-two@test.test');

select 'an account with no orders is listed at zero rather than left out: ' ||
  (select count(*) = 1 from public.admin_user_rows() where email = 'admin@test' and orders = 0);

do $$
declare
  r text;
  v_refused boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    v_refused := false;
    begin
      execute format('set local role %I', r);
      execute 'select * from public.admin_user_rows()';
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    raise notice '% is refused the user list: %', r, v_refused;
  end loop;
end;
$$;
