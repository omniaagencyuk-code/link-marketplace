\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The customer dashboard's own figures.
--
-- The thing worth testing here is not the arithmetic. It is the isolation:
-- these functions run as the caller rather than as a definer, precisely so
-- that row level security decides what each customer can see, and a test that
-- only ever runs as one customer would pass whatever they could read.
--
-- So every figure is checked twice, once as each of two customers with
-- different orders, and the two answers must differ.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-000000000001', 'cust-a@test.test'),
  ('00000000-0000-4000-b000-000000000002', 'cust-b@test.test'),
  -- A customer who has never ordered, which is every new one.
  ('00000000-0000-4000-b000-000000000003', 'cust-c@test.test')
on conflict (id) do nothing;

/*
  All four in one category, which is the signal recommendations run on.

  Without a category these listings carry no signal at all, and the
  personalisation check below passes for the wrong reason - the function
  correctly reports "not personalised" because there is nothing to
  personalise from. That is what it did on the first run of this file.
*/
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, domain_rating, primary_category_id)
select v.slug, v.domain, v.title, v.status::public.website_status, 'GB', 'stated', 'en', v.dr,
       (select id from public.categories where slug = 'technology')
from (values
  ('cd-one',   'cd-one.test',   'One',   'active', 70),
  ('cd-two',   'cd-two.test',   'Two',   'active', 60),
  ('cd-three', 'cd-three.test', 'Three', 'active', 50),
  ('cd-off',   'cd-off.test',   'Off',   'paused', 90)
) as v(slug, domain, title, status, dr)
on conflict (slug) do nothing;

insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 20000, true from public.websites where slug like 'cd-%'
on conflict (website_id, type) do nothing;

-- Customer A: one live order of two placements, one cancelled.
insert into public.orders (reference, user_id, status, total_minor, placed_at)
values
  ('CD-A-LIVE', '00000000-0000-4000-b000-000000000001', 'live',      40000, timezone('utc', now())),
  ('CD-A-CANX', '00000000-0000-4000-b000-000000000001', 'cancelled', 99900, timezone('utc', now()))
on conflict (reference) do nothing;

-- Customer B: one order still in progress, and nothing live.
insert into public.orders (reference, user_id, status, total_minor, placed_at)
values ('CD-B-PROG', '00000000-0000-4000-b000-000000000002', 'in-progress', 20000, timezone('utc', now()))
on conflict (reference) do nothing;

/*
  Guarded by `not exists`, because `on conflict do nothing` guards nothing
  here - `order_items` has no unique key these columns would collide on, so
  a second run of this file inserted a second copy of every placement and the
  live-link count grew by two each time. The suite drops the database between
  runs so it never showed there; running the file twice by hand did.
*/
insert into public.order_items (order_id, website_id, service_type, status, price_minor, target_url, website_domain, website_slug)
select o.id, w.id, 'guest-post', 'live', 20000, 'https://buyer-a.test/page', w.domain, w.slug
from public.orders o, public.websites w
where o.reference = 'CD-A-LIVE' and w.slug in ('cd-one', 'cd-two')
  and not exists (
    select 1 from public.order_items x where x.order_id = o.id and x.website_id = w.id
  );

insert into public.order_items (order_id, website_id, service_type, status, price_minor, target_url, website_domain, website_slug)
select o.id, w.id, 'guest-post', 'in-progress', 20000, 'https://buyer-b.test/page', w.domain, w.slug
from public.orders o, public.websites w
where o.reference = 'CD-B-PROG' and w.slug = 'cd-three'
  and not exists (
    select 1 from public.order_items x where x.order_id = o.id and x.website_id = w.id
  );

-- ------------------------------------------------------ as the first customer

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';

select 'their live links count placements, not orders: ' ||
  (select live_links = 2 from public.customer_dashboard_summary());

/*
  The cancelled order is not spend.

  It is the rule the dashboard already used, and the one most likely to be
  quietly lost: 400 is the live order alone, 1399 would mean the cancelled
  one came too.
*/
select 'a cancelled order is not counted as spend: ' ||
  (select total_spend_minor = 40000 from public.customer_dashboard_summary());

select 'and they have nothing in progress: ' ||
  (select in_progress = 0 from public.customer_dashboard_summary());

-- ----------------------------------------------------- as the second customer

set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000002';

/*
  The same three questions, answered differently.

  This is the check that the function is scoped at all. Asked only as one
  customer, every assertion above would pass against a function that returned
  the whole table.
*/
select 'the other customer sees their own live links: ' ||
  (select live_links = 0 from public.customer_dashboard_summary());

select 'their own spend: ' ||
  (select total_spend_minor = 20000 from public.customer_dashboard_summary());

select 'and their own work in progress: ' ||
  (select in_progress = 1 from public.customer_dashboard_summary());

select 'neither of them sees the other''s orders: ' ||
  (select orders_all = 1 from public.customer_dashboard_summary());

-- -------------------------------------------------------- recommendations

/*
  A customer with no orders gets no claim of personalisation.

  The flag is what the heading is chosen from - "Recommended for you" against
  "Popular websites" - so a function that always said true would have the
  dashboard telling every new customer its suggestions were based on them.
*/
/*
  The customer with no orders at all, not merely no finished ones.

  This first asked customer B, who has an order in progress - so the
  function correctly reported personalised, and the assertion was wrong
  rather than the code. Any non-draft order is a signal; what has none is a
  customer who has never bought.
*/
set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000003';
select 'a customer who has never ordered is told it is not personalised: ' ||
  (select coalesce(bool_and(personalised) = false, true) from public.customer_recommendations(4));

select 'and is still shown something to look at: ' ||
  (select count(*) > 0 from public.customer_recommendations(4));

select 'a paused listing is never suggested: ' ||
  (select count(*) = 0 from public.customer_recommendations(12) r
   join public.websites w on w.id = r.id where w.slug = 'cd-off');

set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';

select 'a customer who has ordered is told it is personalised: ' ||
  (select coalesce(bool_and(personalised), false) from public.customer_recommendations(4));

/*
  And the suggestion is from the category they bought in.

  Without this the flag could be right while the list was the whole
  marketplace, which is the failure that would look like it worked.
*/
select 'and the suggestion comes from that category: ' ||
  (select count(*) = 1 from public.customer_recommendations(12) r
   join public.websites w on w.id = r.id where w.slug = 'cd-three');

/*
  Never suggest something they already bought.

  A marketplace recommending a placement the customer is currently paying for
  reads as the site not knowing who they are.
*/
select 'a listing they already bought is not suggested back: ' ||
  (select count(*) = 0 from public.customer_recommendations(12) r
   join public.websites w on w.id = r.id where w.slug in ('cd-one', 'cd-two'));

reset request.jwt.claim.sub;
reset role;
