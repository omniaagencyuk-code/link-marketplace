\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'buyer@test');

insert into public.orders (reference, user_id, status, total_minor, currency)
values ('PP-TEST1', '55555555-5555-5555-5555-555555555555', 'draft', 50000, 'GBP');

select 'new order is unpaid: ' || payment_status from public.orders where reference = 'PP-TEST1';

-- Checkout attaches its session.
update public.orders
   set stripe_checkout_session_id = 'cs_test_123', payment_status = 'processing'
 where reference = 'PP-TEST1';

-- The webhook finds the order by session and moves it on.
select public.set_order_status(id, 'awaiting-content', 'Payment received.', null)
  from public.orders where stripe_checkout_session_id = 'cs_test_123';

select 'status after payment: ' || status from public.orders where reference = 'PP-TEST1';
select 'history rows: ' || count(*) from public.order_status_history;
select 'history records the note: ' || note from public.order_status_history limit 1;
select 'system change has no author: ' || (changed_by is null) from public.order_status_history limit 1;

-- Two sessions cannot both claim one order.
insert into public.orders (reference, user_id, status, total_minor, stripe_checkout_session_id)
values ('PP-TEST2', '55555555-5555-5555-5555-555555555555', 'draft', 100, 'cs_test_123');

-- Webhook replay: the same event id is refused the second time.
insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed');
insert into public.stripe_events (id, type) values ('evt_1', 'checkout.session.completed');

-- A customer sees their own history and nobody else's.
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select 'buyer sees own history: ' || count(*) from public.order_status_history;
select 'buyer sees stripe_events: ' || count(*) from public.stripe_events;
reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'other customer sees history: ' || count(*) from public.order_status_history;
reset role; reset request.jwt.claim.sub;

set role anon;
select 'anon sees history: ' || count(*) from public.order_status_history;
reset role;
