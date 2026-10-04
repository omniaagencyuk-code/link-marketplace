\pset tuples_only on
\pset format unaligned

-- A readable promo table is a published list of every code in the business,
-- so it gets the same proof the cost prices and the publisher addresses get:
-- not "the checkout only asks about one code", but "the database will not
-- hand the others over".
--
-- This matters more than it looks. A customer who can read `promo_codes` does
-- not just learn the codes - they learn the expiry dates, the minimum spends
-- and which ones have no usage limit, which is precisely the information you
-- would want before posting one publicly.

-- --------------------------------------------------- written as an admin
-- The admin area holds no Supabase identity, so every write it makes goes
-- through the service role. That is what this is.
set role service_role;

insert into public.promo_codes (code, description, kind, percent_off, max_redemptions, stripe_coupon_id)
values ('RLSTEST25', 'Spring newsletter', 'percent', 25, 50, 'co_rlstest');
insert into public.promo_codes (code, description, kind, amount_off_minor, currency, stripe_coupon_id)
values ('RLSTENOFF', 'Winback', 'fixed', 1000, 'GBP', 'co_rlstest2');

select 'service role stored codes: ' || count(*) from public.promo_codes;

insert into public.orders (reference, user_id, status, total_minor, currency)
values ('PP-PROMO1', '22222222-2222-2222-2222-222222222222', 'draft', 40000, 'GBP');

/*
  Real ids, parked where a customer can reach them.

  The first version of the customer's insert below read its ids straight out
  of `promo_codes` - which a customer cannot read, so the select returned no
  rows, the insert inserted nothing, and the test reported that a customer had
  awarded themselves a redemption when nothing of the sort had happened. A
  test that passes because its own setup was empty is worse than no test.

  A temp table is not subject to row level security and belongs to the
  session, not the role, so `set role` does not take it away. That makes the
  attempt below a real one with real foreign keys, where the only thing that
  can stop it is the policy.
*/
create temp table promo_ids as
select c.id as code_id, o.id as order_id, o.user_id
  from public.promo_codes c, public.orders o
 where c.code = 'RLSTEST25' and o.reference = 'PP-PROMO1';

/*
  And readable by the role that is about to try.

  Without this grant the attempts below fail with "permission denied for
  table promo_ids" - which is still an `insufficient_privilege`, so the
  handler reported a refusal and the test passed while proving nothing about
  `promo_redemptions` at all. Second time this test has passed for the wrong
  reason; the grant is what makes the policy the only thing left to stop it.
*/
grant select on promo_ids to authenticated;

select 'ids parked for the customer to try: ' || count(*) from promo_ids;

reset role;

-- ---------------------------------------------------------------- as anon
set role anon;
select 'anon reads promo_codes: ' || count(*) from public.promo_codes;
select 'anon reads any code: ' || coalesce(
  (select string_agg(code, ',') from public.promo_codes), 'none');
reset role;

-- ------------------------------------------------- as a signed-in customer
-- The case that matters: a customer with a real session, who can read the
-- marketplace, and must still see nothing here.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select 'customer reads promo_codes: ' || count(*) from public.promo_codes;
select 'customer reads any code: ' || coalesce(
  (select string_agg(code, ',') from public.promo_codes), 'none');
select 'customer reads redemptions: ' || count(*) from public.promo_redemptions;

-- Nor can they write one, which would be the obvious way to make the table
-- speak: insert a code and read back what it collides with.
do $$
begin
  insert into public.promo_codes (code, kind, percent_off) values ('RLSTEST25', 'percent', 90);
  raise notice 'a customer created a code: true';
exception
  when insufficient_privilege then raise notice 'a customer creating a code is refused: true';
  when unique_violation then raise notice 'a customer learned a code exists: LEAK';
end;
$$;

-- Nor award themselves a redemption, which would consume somebody else's
-- limited code or - worse - look like a discount that was never given.
--
-- The ids come from the temp table, so this is a real insert of a real row
-- against real foreign keys. Nothing but the policy can stop it.
do $$
declare
  v_code uuid;
  v_order uuid;
  v_user uuid;
begin
  select code_id, order_id, user_id into v_code, v_order, v_user from promo_ids;

  if v_code is null then
    raise notice 'the attempt had no ids to use: TEST BROKEN';
    return;
  end if;

  insert into public.promo_redemptions (promo_code_id, order_id, user_id, discount_minor)
  values (v_code, v_order, v_user, 99999);
  raise notice 'a customer awarded themselves a redemption: true';
exception
  when insufficient_privilege then raise notice 'a customer awarding a redemption is refused: true';
end;
$$;

/*
  But they CAN put a code id on their own order.

  This is the one that would have failed only in production. Checkout writes
  the order as the signed-in customer - that is what proves the order is for
  them - and the row carries `promo_code_id`, a foreign key into a table the
  customer cannot read a single row of. If a referential integrity check were
  subject to row level security, every discounted checkout would have failed
  with a constraint error and nothing short of a real order would have shown
  it.

  Postgres performs those checks bypassing row security, so it works. Pinned
  here because "it works for a reason I read in the manual" is not the same as
  "it works", and the reason is not visible from the application code.
*/
do $$
declare
  v_code uuid;
begin
  select code_id into v_code from promo_ids;

  insert into public.orders (reference, user_id, status, total_minor, currency, promo_code_id, promo_code, discount_minor)
  values ('PP-PROMO2', '22222222-2222-2222-2222-222222222222', 'draft', 40000, 'GBP', v_code, 'RLSTEST25', 10000);

  raise notice 'a customer can attach an unreadable code to their own order: true';
exception
  when others then raise notice 'a customer attaching a code to their own order FAILED: %', sqlerrm;
end;
$$;

select 'the discount landed on their order: ' || coalesce(
  (select discount_minor::text from public.orders where reference = 'PP-PROMO2'), 'nothing');

reset role;
reset request.jwt.claim.sub;

-- --------------------------------------------------------- the constraints
-- These are the ones that would let a bad code exist at all. Each is proved
-- by trying it as the service role, which has every privilege and is still
-- stopped by a check constraint.
set role service_role;

do $$
begin
  insert into public.promo_codes (code, kind, percent_off) values ('rlslower', 'percent', 10);
  raise notice 'a lower case code was accepted: true';
exception when check_violation then raise notice 'a lower case code is refused: true';
end;
$$;

do $$
begin
  insert into public.promo_codes (code, kind, percent_off, amount_off_minor)
  values ('RLSBOTH', 'percent', 10, 500);
  raise notice 'a code with two kinds of discount was accepted: true';
exception when check_violation then raise notice 'a code with two kinds of discount is refused: true';
end;
$$;

do $$
begin
  insert into public.promo_codes (code, kind, amount_off_minor) values ('RLSNOCCY', 'fixed', 500);
  raise notice 'a fixed code with no currency was accepted: true';
exception when check_violation then raise notice 'a fixed code with no currency is refused: true';
end;
$$;

do $$
begin
  insert into public.promo_codes (code, kind, percent_off, starts_at, expires_at)
  values ('RLSBACK', 'percent', 10, '2026-06-01', '2026-05-01');
  raise notice 'a code expiring before it starts was accepted: true';
exception when check_violation then raise notice 'a code expiring before it starts is refused: true';
end;
$$;

-- One redemption per order, which is what makes the Stripe webhook safe to
-- retry: the same event arrives twice as a matter of course. The order was
-- created above, before the customer tried to redeem against it.
insert into public.promo_redemptions (promo_code_id, order_id, user_id, discount_minor)
select c.id, o.id, o.user_id, 10000
  from public.promo_codes c, public.orders o
 where c.code = 'RLSTEST25' and o.reference = 'PP-PROMO1';

do $$
begin
  insert into public.promo_redemptions (promo_code_id, order_id, user_id, discount_minor)
  select c.id, o.id, o.user_id, 10000
    from public.promo_codes c, public.orders o
   where c.code = 'RLSTEST25' and o.reference = 'PP-PROMO1';
  raise notice 'the same order redeemed twice: true';
exception when unique_violation then raise notice 'the same order cannot redeem twice: true';
end;
$$;

-- One, not two: the customer's attempt above left nothing behind. This is the
-- assertion that proves the refusal was a refusal and not a silent no-op.
select 'redemptions counted: ' || count(*) from public.promo_redemptions;

-- Switching a code off leaves the redemption history alone, which is why the
-- admin screen offers "switch off" and only ever offers "delete" for a code
-- nobody has used.
update public.promo_codes set active = false where code = 'RLSTEST25';
select 'redemptions after switching the code off: ' || count(*) from public.promo_redemptions;

reset role;
