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
  0093's counting function, on the same terms. The figures it returns are
  printed on a public page, but the page reads them through the service-role
  client like everything else here, and a function the anon key can call is
  a function somebody can walk.
*/
do $$
declare
  v_refused boolean;
begin
  begin
    perform * from public.niche_page_counts();
    v_refused := false;
  exception when insufficient_privilege then
    v_refused := true;
  end;
  raise notice 'nor count the niches: %', v_refused;
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

-- --------------------------------------------------------- what was refused
/*
  A refusal is the one event worth keeping.

  The counter in `rate_limits` resets when the window rolls, so without this
  a customer stopped at two in the afternoon leaves no trace by three - and
  "the marketplace told me to come back later" is unanswerable. 0091 records
  it inside the function rather than in the caller, so it cannot be
  forgotten by a future one.
*/
/*
  Spent in its own statement, asserted in the next.

  The first version called the function in a `from` subquery and counted the
  rows in the same statement, which reported none: a statement reads the
  snapshot taken when it started, so an insert the function makes while it
  runs is not visible to the rest of it. A `do` block spends and prints
  nothing, and the count that follows sees what it wrote.
*/
do $$ begin perform public.spend_inventory_budget('t:quiet', 5, 100, 3600); end; $$;

select 'nothing is recorded while the budget holds: ' ||
  (select count(*) = 0 from public.inventory_refusals where bucket = 't:quiet');

do $$ begin perform public.spend_inventory_budget('t:loud', 500, 100, 3600); end; $$;

select 'a refusal is recorded: ' ||
  (select count(*) = 1 from public.inventory_refusals where bucket = 't:loud');

select 'with what the read would have cost: ' ||
  (select bool_and(rows_asked = 500) from public.inventory_refusals where bucket = 't:loud');

-- A second refusal is a second row: one of them is a customer at a ceiling,
-- ten in a minute is somebody walking the inventory.
do $$ begin perform public.spend_inventory_budget('t:loud', 10, 100, 3600); end; $$;

select 'and each refusal is its own row: ' ||
  (select count(*) = 2 from public.inventory_refusals where bucket = 't:loud');

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-b000-000000000001';

/*
  Internal, on the terms every other internal table here has. What it holds
  is which customer asked for too much and when, which is a judgement about
  them rather than inventory.
*/
select 'a customer cannot read who was refused: ' ||
  (select count(*) = 0 from public.inventory_refusals);

reset request.jwt.claim.sub;
reset role;

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

/*
  And may count the niches, which is what /guest-posts asks on every
  revalidation. Before 0093 it asked by reading every active listing, and
  the answer came back as a statement timeout.
*/
select 'and may count the niches: ' ||
  (select count(*) >= 0 from public.niche_page_counts());

select 'and the services under it: ' ||
  (select count(*) > 0 from public.services);

reset role;
