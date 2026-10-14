\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The customer's own reference on an order.
--
-- An agency has one login and five people ordering through it. `reference`
-- is ours - LM-10428 - and every row's customer name is the same, so the
-- label somebody typed is the only thing that tells their order from the
-- other four. 0085 adds the column and makes it searchable.
--
-- Two checks here are the ones that would catch a real mistake rather than
-- restate the schema:
--
--   * **An unlabelled order is still findable.** Most orders carry nothing,
--     and concatenating a null into the search haystack makes the whole
--     haystack null - so every order without a label would stop matching
--     its own reference, its customer's name and their email. That is a
--     search that works only for the minority who filled the box in, and
--     nobody would report it as anything but "it didn't find it".
--
--   * **It is not an identity.** Not unique, not generated, not ours. Five
--     people may all type "Sarah" and two orders may both say "Q4". A test
--     that only ever stores distinct values would pass against a unique
--     index, which would start refusing orders at checkout.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-4000-9100-000000000001', 'cr-agency@zqcref.test'),
  ('00000000-0000-4000-9100-000000000002', 'cr-other@zqcref.test')
on conflict (id) do nothing;

update public.profiles set full_name = 'Northbound Agency'
 where email = 'cr-agency@zqcref.test';
update public.profiles set full_name = 'Someone Else'
 where email = 'cr-other@zqcref.test';

/*
  Four orders on the one agency account, as if four people had used it, plus
  one on a different account. Two of the four share a label on purpose.
*/
insert into public.orders (id, reference, user_id, status, total_minor, placed_at, customer_reference)
values
  ('00000000-0000-4000-d000-000000000001', 'ZQC-0001', '00000000-0000-4000-9100-000000000001', 'live', 10000, '2026-04-05T00:00:00Z', 'Sarah - Northbound Q4'),
  ('00000000-0000-4000-d000-000000000002', 'ZQC-0002', '00000000-0000-4000-9100-000000000001', 'live', 10000, '2026-04-04T00:00:00Z', 'Dev - PO 88213'),
  ('00000000-0000-4000-d000-000000000003', 'ZQC-0003', '00000000-0000-4000-9100-000000000001', 'live', 10000, '2026-04-03T00:00:00Z', 'Dev - PO 88213'),
  ('00000000-0000-4000-d000-000000000004', 'ZQC-0004', '00000000-0000-4000-9100-000000000001', 'live', 10000, '2026-04-02T00:00:00Z', null),
  ('00000000-0000-4000-d000-000000000005', 'ZQC-0005', '00000000-0000-4000-9100-000000000002', 'live', 10000, '2026-04-01T00:00:00Z', 'Sarah - Northbound Q4')
on conflict (id) do nothing;

-- ------------------------------------------------------------- what it holds

select 'an order may carry no reference at all: ' ||
  (select customer_reference is null from public.orders where reference = 'ZQC-0004');

select 'and nothing is defaulted into it: ' ||
  (select count(*) = 1 from public.orders
    where user_id = '00000000-0000-4000-9100-000000000001'
      and customer_reference is null);

/*
  Blank is not a value.

  "Has a reference" has to be one question rather than two, or every read of
  the column needs to know that '' and null mean the same thing - and one of
  them will forget.
*/
do $$
begin
  update public.orders set customer_reference = ''
   where reference = 'ZQC-0004';
  raise notice 'an empty reference was accepted: false';
exception
  when check_violation then raise notice 'an empty reference is refused: true';
end;
$$;

do $$
begin
  update public.orders set customer_reference = '    '
   where reference = 'ZQC-0004';
  raise notice 'a reference of nothing but spaces was accepted: false';
exception
  when check_violation then raise notice 'a reference of nothing but spaces is refused: true';
end;
$$;

do $$
begin
  update public.orders set customer_reference = '  Sarah  '
   where reference = 'ZQC-0004';
  raise notice 'an untrimmed reference was accepted: false';
exception
  when check_violation then raise notice 'an untrimmed reference is refused: true';
end;
$$;

-- The positive control beside those three: the column does take a value, so
-- the refusals above are the check doing its job rather than the column
-- refusing everything.
update public.orders set customer_reference = 'Sarah'
 where reference = 'ZQC-0004';

select 'a trimmed reference is accepted: ' ||
  (select customer_reference = 'Sarah' from public.orders where reference = 'ZQC-0004');

-- Back to unlabelled, which is what the search checks below rest on.
update public.orders set customer_reference = null where reference = 'ZQC-0004';

select 'and it can be cleared again: ' ||
  (select customer_reference is null from public.orders where reference = 'ZQC-0004');

/*
  A length a person would type, and a ceiling.

  120 is roomy for a name, a client and a quarter; it is there so the column
  cannot be used as a notes field, and so the orders table has something
  bounded to render.
*/
do $$
begin
  update public.orders set customer_reference = repeat('a', 121)
   where reference = 'ZQC-0004';
  raise notice '121 characters was accepted: false';
exception
  when check_violation then raise notice '121 characters is refused: true';
end;
$$;

update public.orders set customer_reference = repeat('a', 120)
 where reference = 'ZQC-0004';

select '120 characters is accepted: ' ||
  (select length(customer_reference) = 120 from public.orders where reference = 'ZQC-0004');

update public.orders set customer_reference = null where reference = 'ZQC-0004';

/*
  Punctuation, spaces inside, accents, a hash: it is whatever the customer
  calls their own work and nothing reads it.
*/
update public.orders set customer_reference = 'Café Noir / #88213 (Q4) – Zoë'
 where reference = 'ZQC-0004';

select 'punctuation and accents inside are fine: ' ||
  (select customer_reference = 'Café Noir / #88213 (Q4) – Zoë'
     from public.orders where reference = 'ZQC-0004');

update public.orders set customer_reference = null where reference = 'ZQC-0004';

-- ------------------------------------------------------- not an identity

select 'two orders on one account may share a reference: ' ||
  (select count(*) = 2 from public.orders
    where user_id = '00000000-0000-4000-9100-000000000001'
      and customer_reference = 'Dev - PO 88213');

select 'and two accounts may use the same one: ' ||
  (select count(*) = 2 from public.orders
    where customer_reference = 'Sarah - Northbound Q4');

/*
  Ours is still ours.

  The customer's label sits beside `reference` rather than replacing it:
  support quotes ours, an invoice shows ours, and an identity the customer
  can rewrite is not an identity.
*/
select 'our own reference is unchanged by any of this: ' ||
  (select count(distinct reference) = 5 from public.orders
    where reference like 'ZQC-%');

-- --------------------------------------------- what the admin search finds

select 'the customer''s own reference is searched: ' ||
  (select count(*) = 1 from public.admin_order_page('PO 88213', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQC-0002');

select 'and both orders carrying that label come back: ' ||
  (select count(*) = 2 from public.admin_order_page('PO 88213', 'all', 50, 0));

select 'case does not matter in it either: ' ||
  (select count(*) = 2 from public.admin_order_page('sarah - northbound q4', 'all', 50, 0));

/*
  A partial label matches, and the term is narrower than the account name on
  purpose: 'northbound' alone would match all four of this agency's orders
  through `full_name` and prove nothing about the label.
*/
select 'a partial label matches: ' ||
  (select count(*) = 2 from public.admin_order_page('Northbound Q4', 'all', 50, 0));

select 'and a label nobody used matches nothing: ' ||
  (select count(*) = 0 from public.admin_order_page('PO 99999', 'all', 50, 0));

/*
  The one that matters.

  `coalesce` round the column is what keeps an unlabelled order findable.
  Without it the concatenation is null for every order that carries no
  label, `position(... in null)` is null, and ZQC-0004 stops matching its
  own reference, the agency's name and their email - all four of which the
  table prints. Asserted four ways because each is a different thing
  somebody would have typed.
*/
select 'an unlabelled order is still found by our reference: ' ||
  (select count(*) = 1 from public.admin_order_page('ZQC-0004', 'all', 50, 0));

select 'and by the customer''s name: ' ||
  (select count(*) = 1 from public.admin_order_page('northbound agency', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQC-0004');

select 'and by their email: ' ||
  (select count(*) = 1 from public.admin_order_page('cr-agency@zqcref.test', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQC-0004');

select 'all four of the agency''s orders come back, labelled or not: ' ||
  (select count(*) = 4 from public.admin_order_page('cr-agency@zqcref.test', 'all', 50, 0));

/*
  A term is input here too. 0074 made that true of the reference and the
  email; a label is the field most likely to contain one, because a customer
  typing "50% off campaign" has no idea it is a pattern character.
*/
select 'a per cent sign in a label search is a literal: ' ||
  (select count(*) = 0 from public.admin_order_page('PO%88213', 'all', 50, 0));

select 'an underscore is too: ' ||
  (select count(*) = 0 from public.admin_order_page('PO_88213', 'all', 50, 0));

update public.orders set customer_reference = '50% off push'
 where reference = 'ZQC-0004';

select 'and a label that really contains one is found by typing it: ' ||
  (select count(*) = 1 from public.admin_order_page('50% off', 'all', 50, 0) p
   join public.orders o on o.id = p.id where o.reference = 'ZQC-0004');

update public.orders set customer_reference = null where reference = 'ZQC-0004';

-- ------------------------------------------------------- whose label it is

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-9100-000000000001';

select 'a customer reads their own labels: ' ||
  (select count(*) = 2 from public.orders
    where customer_reference = 'Dev - PO 88213');

/*
  Not somebody else's.

  The label is the only field on an order a person writes in free text, so
  it is the one most likely to say something about a client by name. It is
  covered by the same policy as the rest of the order and this says so.
*/
select 'and not another account''s, even sharing a label: ' ||
  (select count(*) = 1 from public.orders
    where customer_reference = 'Sarah - Northbound Q4');

/*
  A live order's label is changed through our own server action, which runs
  as the service role and filters on the owner, rather than by the browser
  reaching PostgREST. 0002 only lets a customer update their own *draft*
  orders, and that is deliberately unchanged here: widening it so the
  browser could write this one field would also let a draft's own
  `reference` and totals be rewritten.
*/
with touched as (
  update public.orders set customer_reference = 'mine now'
   where reference = 'ZQC-0001' returning 1
)
select 'a customer cannot relabel their own live order directly: ' ||
  (select count(*) = 0 from touched);

with touched as (
  update public.orders set customer_reference = 'theirs now'
   where reference = 'ZQC-0005' returning 1
)
select 'nor anybody else''s: ' ||
  (select count(*) = 0 from touched);

reset request.jwt.claim.sub;
reset role;

select 'and the label is what it was: ' ||
  (select customer_reference = 'Sarah - Northbound Q4'
     from public.orders where reference = 'ZQC-0001');

-- ------------------------------------------------------------- the index

select 'the lookup index exists: ' ||
  (select count(*) = 1 from pg_indexes
    where schemaname = 'public' and indexname = 'orders_customer_reference_idx');

select 'and is partial, over the labelled orders only: ' ||
  (select position('customer_reference IS NOT NULL' in indexdef) > 0
     from pg_indexes
    where schemaname = 'public' and indexname = 'orders_customer_reference_idx');

select 'and case-folded, because somebody typing "sarah" means "Sarah": ' ||
  (select position('lower(customer_reference)' in indexdef) > 0
     from pg_indexes
    where schemaname = 'public' and indexname = 'orders_customer_reference_idx');
