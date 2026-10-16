\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The inventory, after 0090.
--
-- Everything else in this suite asks whether a role may read a row. This asks
-- the question a row-at-a-time answer cannot: whether a customer's own token
-- can be used to take the whole table.
--
-- Until 0090 it could. `to authenticated using (status = 'active')` is also an
-- instruction to PostgREST, and the publishable key that carries the session
-- is in the page - so a free account was thirteen thousand-row requests away
-- from every domain, price and metric we hold. What follows is the proof that
-- the door is shut: not that the rows are filtered, that there are no rows.
--
-- The application reads these tables on the service role instead, which the
-- last section here pins, because "the app still works" is exactly what you
-- would also see if somebody quietly put the policy back.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------- what a customer may read
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';

select 'a customer reads no websites at all: ' ||
  (select count(*) = 0 from public.websites);

select 'not even an active one: ' ||
  (select count(*) = 0 from public.websites where status = 'active');

select 'no services, so no prices: ' ||
  (select count(*) = 0 from public.services);

select 'and no website categories: ' ||
  (select count(*) = 0 from public.website_categories);

/*
  The categories table itself stays readable, and should.

  It is the list of niches - eleven words that are on every public page and in
  every menu. Closing it would break the filters without hiding anything.
*/
select 'the niche list is still readable, because it is public knowledge: ' ||
  (select count(*) > 0 from public.categories);

-- -------------------------------------------- what the functions may be asked
/*
  Ids and counts are not domains, but each of these is a way to ask the shape
  of the inventory in bulk, and none is called from a browser.
*/
do $$
declare
  v_refused boolean;
begin
  begin
    perform * from public.marketplace_search(p_limit => 1);
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  raise notice 'a customer cannot call marketplace_search: %', v_refused;
end;
$$;

do $$
declare
  v_refused boolean;
begin
  begin
    perform public.spend_inventory_budget('probe', 1, 10, 60);
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  raise notice 'nor the budget function, which is how a limit gets probed: %', v_refused;
end;
$$;

/*
  The one that keeps its grant, and why.

  `customer_recommendations` personalises by auth.uid(); on the service role
  there is no uid, so it is the single inventory function that has to run as
  the customer. What it returns is bounded by the function itself - at most
  twelve ids, no domain, no price.
*/
do $$
declare
  v_allowed boolean;
begin
  begin
    perform * from public.customer_recommendations(4);
    v_allowed := true;
  exception when insufficient_privilege then
    v_allowed := false;
  end;
  raise notice 'a customer may still ask for their own suggestions: %', v_allowed;
end;
$$;

reset request.jwt.claim.sub;
reset role;

-- ----------------------------------------------------------------- the budget
/*
  Spent in rows rather than attempts, which is the whole point of it: asking
  for a hundred listings has to cost a hundred, or a limit on requests is a
  limit on nothing.
*/
select 'a small read is allowed: ' ||
  (select public.spend_inventory_budget('t:one', 10, 100, 3600) = 0);

select 'and so is the next one, while the budget holds: ' ||
  (select public.spend_inventory_budget('t:one', 10, 100, 3600) = 0);

select 'a read that would go past the budget is refused: ' ||
  (select public.spend_inventory_budget('t:one', 200, 100, 3600) > 0);

select 'and the refusal is a number of seconds to wait: ' ||
  (select public.spend_inventory_budget('t:one', 1, 100, 3600) between 1 and 3600);

/*
  One account's spending is its own.

  Keyed on the bucket, so an agency office sharing an address does not share
  a budget - the reason the planner's lookup is keyed on the account too.
*/
select 'another account is unaffected by the first one''s spending: ' ||
  (select public.spend_inventory_budget('t:two', 10, 100, 3600) = 0);

select 'a window that has expired starts again: ' ||
  (select public.spend_inventory_budget('t:three', 60, 100, 0) = 0
   and public.spend_inventory_budget('t:three', 60, 100, 3600) = 0);

-- A read costing nothing cannot be a way to exhaust somebody's budget.
select 'a read of nothing costs nothing: ' ||
  (select public.spend_inventory_budget('t:four', 0, 1, 3600) = 0);

-- ------------------------------------------------ the service role still reads
/*
  The half that is easy to forget.

  If this returned nothing, every assertion above would still pass and the
  marketplace would be empty for everybody - which is the shape of a security
  change that took the feature with it.
*/
set role service_role;

select 'the service role still reads the inventory: ' ||
  (select count(*) > 0 from public.websites);

/*
  And can still call what the application calls.

  Revoking from PUBLIC takes the grant away from every role that had no
  explicit one of its own, the service role included - so a migration that
  closes a function to customers can close it to the application in the same
  line. Asserted in both directions for that reason.
*/
select 'the service role may search: ' ||
  (select count(*) >= 0 from public.marketplace_search(p_limit => 1));

select 'and may spend from a budget: ' ||
  (select public.spend_inventory_budget('t:service', 1, 100, 3600) = 0);

select 'and the services under it: ' ||
  (select count(*) > 0 from public.services);

reset role;
