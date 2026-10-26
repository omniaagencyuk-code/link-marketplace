\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Clearing an inventory budget, and what it may not reach.
--
-- 0094 lets a customer's own basket clear what their account has spent
-- against the hourly inventory budget. That is a deliberate loosening - the
-- guard is there so that *copying* the inventory is slow, and it had started
-- stopping people reading it - but it puts a function that deletes from
-- `rate_limits` on a customer's happy path, and `rate_limits` is the table
-- 0009 described as one where "nobody can clear their own".
--
-- Both halves of that are checked here. The table's rule is unchanged: no
-- grant, no policy, nothing a browser's token can reach. What our server may
-- do on a customer's behalf is narrowed by the function itself, to one
-- prefix - so the sign-in throttle, which guards the front door, stays out
-- of reach of anything a customer can trigger.
-- ---------------------------------------------------------------------------

set role postgres;

-- Two counters: one an account's inventory spend, one a sign-in throttle.
--
-- Four, not two. A clear that deleted every inventory bucket rather than the
-- one it was given would pass a fixture holding a single account, and a
-- prefix check loosened to drop the colon would pass one holding no
-- look-alike bucket to catch it out.
--
-- Every assertion below counts rows rather than comparing a column. A
-- comparison against a row that is gone is NULL, 'label: ' || NULL is NULL,
-- and a line that prints nothing is dropped by the runner's filter - so the
-- widened delete this fixture exists to catch disappeared from the tally
-- instead of failing it.
insert into public.rate_limits (bucket, count, expires_at) values
  ('inventory-rows:11111111-1111-4111-8111-111111111111', 4200, timezone('utc', now()) + interval '30 minutes'),
  ('inventory-rows:33333333-3333-4333-8333-333333333333', 1700, timezone('utc', now()) + interval '30 minutes'),
  ('inventory-rowsX:1', 5, timezone('utc', now()) + interval '30 minutes'),
  ('sign-in:203.0.113.4', 9, timezone('utc', now()) + interval '5 minutes')
on conflict (bucket) do update set count = excluded.count, expires_at = excluded.expires_at;

-- ------------------------------------------------- it clears what it should
select 'clearing an inventory bucket reports that it did: ' ||
  (select public.clear_inventory_budget('inventory-rows:11111111-1111-4111-8111-111111111111'))::text;

select 'and the counter is gone, so the next window starts at nothing: ' ||
  (select count(*) = 0 from public.rate_limits
    where bucket = 'inventory-rows:11111111-1111-4111-8111-111111111111')::text;

-- One account's basket must not clear another account's hour. The bucket is
-- the argument, not the prefix.
select 'another account''s spend is untouched: ' ||
  (select count(*) = 1 from public.rate_limits
    where bucket = 'inventory-rows:33333333-3333-4333-8333-333333333333'
      and count = 1700)::text;

-- Clearing a bucket nobody has spent against is not an error: a customer
-- whose first action is adding to the basket must not see one.
select 'clearing a bucket that does not exist says so rather than failing: ' ||
  (select public.clear_inventory_budget('inventory-rows:22222222-2222-4222-8222-222222222222') = false)::text;

-- ------------------------------------------------ and nothing it should not
--
-- The prefix check is the whole of this function's authority. Without it the
-- argument names any counter in the table, and the one worth naming is the
-- throttle in front of sign-in.
select 'a sign-in throttle is refused: ' ||
  (select public.clear_inventory_budget('sign-in:203.0.113.4') = false)::text;

select 'and it is still counting: ' ||
  (select count(*) = 1 from public.rate_limits
    where bucket = 'sign-in:203.0.113.4' and count = 9)::text;

select 'a null bucket is refused: ' ||
  (select public.clear_inventory_budget(null) = false)::text;

-- Not a prefix match somebody could walk out of: the colon is part of it.
--
-- Checked by what survives rather than by what the call returns. A guard
-- loosened to `inventory-rows%` lets this through, finds no row of that name
-- and returns false anyway - so the return value alone cannot tell a refusal
-- from a miss, and the fixture above plants a real row here to make the
-- difference visible.
select 'a bucket merely starting with the word is refused: ' ||
  (select public.clear_inventory_budget('inventory-rowsX:1') = false)::text;

select 'and that bucket is still there: ' ||
  (select count(*) = 1 from public.rate_limits
    where bucket = 'inventory-rowsX:1' and count = 5)::text;

select 'and one with the prefix buried inside it is too: ' ||
  (select public.clear_inventory_budget('sign-in:inventory-rows:1') = false)::text;

-- ---------------------------------------------- who may call it at all
--
-- Our server, under the service role, after it has checked the session.
-- Never a browser holding a customer's token - which is the half of 0009's
-- rule that has not changed.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

-- The succeeding branch has to read as a failure. Written the other way
-- round - both branches printing `: true` - a grant to `authenticated`
-- passes this file, which is how the first version of it did.
do $$
begin
  perform public.clear_inventory_budget('inventory-rows:11111111-1111-4111-8111-111111111111');
  raise notice 'a customer may not call the clear directly: false';
exception
  when insufficient_privilege then raise notice 'a customer may not call the clear directly: true';
  when others then raise notice 'a customer may not call the clear directly: true';
end $$;

do $$
begin
  perform public.spend_inventory_budget('inventory-rows:x', 1, 10, 60);
  raise notice 'a customer may not call the spend directly either: false';
exception
  when insufficient_privilege then raise notice 'a customer may not call the spend directly either: true';
  when others then raise notice 'a customer may not call the spend directly either: true';
end $$;

-- And the table itself is still unreadable and unwritable by a customer,
-- with or without the function.
select 'a customer reads no counters: ' ||
  (select count(*) = 0 from public.rate_limits)::text;

-- A delete as `authenticated` is not refused: there is no delete policy, so
-- it matches no rows and removes nothing. Said in the direction that passes
-- as true, because the obvious phrasing - "a customer deleted a counter" -
-- prints t on a *pass* here, and a tally cannot tell a wrong answer from a
-- right one worded backwards. What it deleted is proved from outside, on the
-- line after this one, where the row can actually be read.
do $$
begin
  delete from public.rate_limits where bucket = 'sign-in:203.0.113.4';
  raise notice 'a customer deletes nothing: true';
exception when insufficient_privilege then
  raise notice 'a customer may not even attempt a delete: true';
end $$;

set role postgres;
select 'the sign-in throttle survived all of that: ' ||
  (select count(*) = 1 from public.rate_limits where bucket = 'sign-in:203.0.113.4')::text;

delete from public.rate_limits where bucket in (
  'sign-in:203.0.113.4',
  'inventory-rowsX:1',
  'inventory-rows:11111111-1111-4111-8111-111111111111',
  'inventory-rows:33333333-3333-4333-8333-333333333333'
);
reset role;
