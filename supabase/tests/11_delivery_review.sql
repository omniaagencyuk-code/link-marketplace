\pset tuples_only on
\pset format unaligned

-- A customer may complain about their own order and nothing else. The whole
-- point of the issue thread is that it is the customer's own words, so the
-- one thing that must never work is raising one on somebody else's placement
-- - or reading theirs.

insert into public.websites (slug, domain, title, country_code, status)
values ('delivery-test-com', 'delivery-test.com', 'Delivery Test', 'GB', 'active');

-- Two customers, two orders. 2222 is the ordinary customer the suite uses;
-- 5555 is the stranger. The profile comes from the handle_new_user trigger,
-- the same way a real one does.
insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'stranger@test');

insert into public.orders (reference, user_id, status, payment_status, total_minor, currency)
values ('PP-MINE', '22222222-2222-2222-2222-222222222222', 'live', 'paid', 15000, 'GBP'),
       ('PP-THEIRS', '55555555-5555-5555-5555-555555555555', 'live', 'paid', 15000, 'GBP');

insert into public.order_items (order_id, website_id, website_domain, website_slug, service_type, price_minor, target_url, status, live_url, delivered_at, auto_approve_at)
select o.id, w.id, w.domain, w.slug, 'guest-post', 15000, 'https://buyer.example/a', 'live',
       'https://delivery-test.com/post', now(), now() + interval '14 days'
from public.orders o, public.websites w
where o.reference in ('PP-MINE', 'PP-THEIRS') and w.slug = 'delivery-test-com';

-- The fixture is asserted rather than assumed. An "insert ... select" that
-- matches no rows raises nothing, so a missing fixture would make every
-- refusal below look like a pass.
do $$
declare n int;
begin
  select count(*) into n from public.order_items where delivered_at is not null;
  if n <> 2 then raise exception 'fixture is wrong: % delivered items, expected 2', n; end if;
end;
$$;
select 'items delivered: ' || count(*) from public.order_items where delivered_at is not null;
select 'and all still pending: ' || count(*) from public.order_items where approval = 'pending';

-- ------------------------------------------------- as the paying customer
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

insert into public.order_item_issues (order_item_id, raised_by, message)
select i.id, '22222222-2222-2222-2222-222222222222', 'The link is nofollow.'
from public.order_items i join public.orders o on o.id = i.order_id
where o.reference = 'PP-MINE';
select 'a customer can raise an issue on their own order: true';

select 'and read it back: ' || count(*) from public.order_item_issues;

-- Somebody else's placement, with the id in hand. This is the attack: an
-- item id is a uuid in a page somewhere, and knowing it must not be enough.
do $$
begin
  insert into public.order_item_issues (order_item_id, raised_by, message)
  select i.id, '22222222-2222-2222-2222-222222222222', 'Not mine to complain about.'
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.reference = 'PP-THEIRS';
  if found then raise notice 'a customer raised an issue on a stranger''s order: true';
  else raise notice 'raising an issue on a stranger''s order wrote nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'raising an issue on a stranger''s order is refused: true';
end;
$$;

-- Nor may they raise one in somebody else's name on their own order, which
-- would put words in a stranger's mouth in our own records.
do $$
begin
  insert into public.order_item_issues (order_item_id, raised_by, message)
  select i.id, '55555555-5555-5555-5555-555555555555', 'Signed by somebody else.'
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.reference = 'PP-MINE';
  if found then raise notice 'a customer signed an issue as another user: true';
  else raise notice 'signing an issue as another user wrote nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'signing an issue as another user is refused: true';
end;
$$;

-- An empty complaint is not a complaint.
do $$
begin
  insert into public.order_item_issues (order_item_id, raised_by, message)
  select i.id, '22222222-2222-2222-2222-222222222222', '   '
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.reference = 'PP-MINE';
  raise notice 'a blank issue was accepted: true';
exception
  when check_violation then raise notice 'a blank issue is refused: true';
end;
$$;

-- A complaint they can edit after we act on it records nothing.
do $$
begin
  update public.order_item_issues set message = 'Actually it was fine.';
  if found then raise notice 'a customer rewrote their own complaint: true';
  else raise notice 'a customer edit changed nothing: true';
  end if;
exception
  when insufficient_privilege then raise notice 'a customer edit is refused outright: true';
end;
$$;

reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------------ as the stranger
set role authenticated;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select 'a stranger reads issues on other orders: ' || count(*) from public.order_item_issues;
reset role;
reset request.jwt.claim.sub;

-- ------------------------------------------------------------ as anon
set role anon;
select 'anon reads issues: ' || count(*) from public.order_item_issues;
reset role;

-- ----------------------------------------------------------- as an admin
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'an admin reads every issue: ' || count(*) from public.order_item_issues;
update public.order_item_issues set resolved_at = now(), resolution_note = 'Publisher fixed the attribute.';
select 'and can resolve one: ' || count(*) from public.order_item_issues where resolved_at is not null;
reset role;
reset request.jwt.claim.sub;

-- An approval is the customer's to give, and the columns exist to record
-- whether they actually gave it or the clock did.
update public.order_items
   set approval = 'approved', approved_at = now(), auto_approved = false
 where order_id = (select id from public.orders where reference = 'PP-MINE');
select 'approval is recorded as theirs, not the clock''s: ' || (auto_approved = false)
  from public.order_items i join public.orders o on o.id = i.order_id
 where o.reference = 'PP-MINE';

-- Issues go when the placement does, rather than outliving the order.
delete from public.orders where reference in ('PP-MINE', 'PP-THEIRS');
select 'issues cascade with the order: ' || (count(*) = 0) from public.order_item_issues;
delete from public.websites where slug = 'delivery-test-com';
delete from auth.users where email = 'stranger@test';
