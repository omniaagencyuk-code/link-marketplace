\pset tuples_only on
\pset format unaligned

-- An order's items are what the customer sees in their dashboard, so an
-- order that moves and leaves its lines behind tells them nothing happened.

insert into public.websites (slug, domain, title, country_code, status)
values ('status-test-com', 'status-test.com', 'Status Test', 'GB', 'active');

insert into public.orders (reference, user_id, status, payment_status, total_minor, currency)
values ('PP-STATUS', '22222222-2222-2222-2222-222222222222', 'draft', 'unpaid', 30000, 'GBP');

insert into public.order_items (order_id, website_id, website_domain, website_slug, service_type, price_minor, target_url, status)
select o.id, w.id, w.domain, w.slug, 'guest-post', 15000, 'https://buyer.example/a', 'draft'
from public.orders o, public.websites w
where o.reference = 'PP-STATUS' and w.slug = 'status-test-com';

insert into public.order_items (order_id, website_id, website_domain, website_slug, service_type, price_minor, target_url, status)
select o.id, w.id, w.domain, w.slug, 'niche-edit', 15000, 'https://buyer.example/b', 'draft'
from public.orders o, public.websites w
where o.reference = 'PP-STATUS' and w.slug = 'status-test-com';

-- Payment arriving: the order moves out of draft.
select public.set_order_status(
  (select id from public.orders where reference = 'PP-STATUS'),
  'awaiting-content', 'Payment received.', null);

select 'order moved: ' || status from public.orders where reference = 'PP-STATUS';
select 'items that followed it: ' || count(*)
  from public.order_items i join public.orders o on o.id = i.order_id
 where o.reference = 'PP-STATUS' and i.status = 'awaiting-content';
select 'items left in draft: ' || count(*)
  from public.order_items i join public.orders o on o.id = i.order_id
 where o.reference = 'PP-STATUS' and i.status = 'draft';

-- One line goes live on its own, which is the ordinary way an order runs.
update public.order_items
   set status = 'live'
 where id = (select i.id from public.order_items i join public.orders o on o.id = i.order_id
              where o.reference = 'PP-STATUS' order by i.price_minor, i.id limit 1);

-- The order moves on. The line that was set individually must not be dragged
-- backwards with it: that would erase what somebody recorded on purpose.
select public.set_order_status(
  (select id from public.orders where reference = 'PP-STATUS'),
  'in-progress', 'Content approved.', null);

select 'the live item stayed live: ' || count(*)
  from public.order_items i join public.orders o on o.id = i.order_id
 where o.reference = 'PP-STATUS' and i.status = 'live';
select 'the in-step item moved on: ' || count(*)
  from public.order_items i join public.orders o on o.id = i.order_id
 where o.reference = 'PP-STATUS' and i.status = 'in-progress';

-- The history still records every move.
select 'status history entries: ' || count(*)
  from public.order_status_history h join public.orders o on o.id = h.order_id
 where o.reference = 'PP-STATUS';

-- A missing order is still an error rather than a silent no-op.
do $$
begin
  perform public.set_order_status('00000000-0000-0000-0000-000000000000', 'live', null, null);
  raise notice 'a missing order was accepted: true';
exception
  when others then raise notice 'a missing order is still refused: true';
end;
$$;

delete from public.orders where reference = 'PP-STATUS';
delete from public.websites where slug = 'status-test-com';
