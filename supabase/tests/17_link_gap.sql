\pset tuples_only on
\pset format unaligned

-- Ships off, with its own allowance.
select 'gap finder ships off: ' || (not enabled) from public.gap_settings;
select 'it has its own budget: ' || monthly_unit_budget from public.gap_settings;
select 'and its own row cap: ' || rows_per_target from public.gap_settings;

insert into public.profiles (id, email, full_name, role)
values ('33333333-3333-3333-3333-333333333333', 'buyer@agency.test', 'Buyer', 'customer')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role)
values ('44444444-4444-4444-4444-444444444444', 'other@agency.test', 'Other', 'customer')
on conflict (id) do nothing;

-- ------------------------------------------------- the two budgets are two --
-- The whole point of a separate ledger. A busy week of gap reports must not
-- stop the marketplace's figures updating, and a heavy refresh must not stop
-- a customer running a report.
insert into public.refresh_runs (status, units_spent, domains_refreshed, finished_at)
values ('completed', 400000, 1000, timezone('utc', now()));

/*
  Captured before and after, not asserted as an absolute.

  Earlier tests in this same database have already spent refresh units, so a
  fixed expected number here would be a test about the order the suite runs
  in. The claim worth making is that one ledger does not move the other.
*/
create temp table before_gap as
  select public.ahrefs_units_this_cycle() as refresh, public.gap_units_this_cycle() as gap;

select 'the gap finder has spent nothing yet: ' || (select gap = 0 from before_gap);

insert into public.gap_lookups (target, rows_returned, units_charged)
values ('competitor.com', 2500, 2500);

select 'a gap pull lands on the gap ledger: ' ||
  (public.gap_units_this_cycle() - (select gap from before_gap) = 2500);
select 'and moves the refresh ledger not at all: ' ||
  (public.ahrefs_units_this_cycle() - (select refresh from before_gap) = 0);

-- And the other way round, which is the half that protects the marketplace.
insert into public.refresh_runs (status, units_spent, domains_refreshed, finished_at)
values ('completed', 123456, 500, timezone('utc', now()));
select 'a refresh run moves the gap ledger not at all: ' ||
  (public.gap_units_this_cycle() - (select gap from before_gap) = 2500);

-- A cached pull costs nothing and is recorded, so "did the cache help" is
-- answerable rather than assumed.
insert into public.gap_lookups (target, rows_returned, units_charged, from_cache)
values ('competitor.com', 2500, 0, true);
select 'a cached pull adds nothing: ' || (public.gap_units_this_cycle() = 2500);
select 'but is still recorded: ' || (count(*) = 2) from public.gap_lookups;

-- A failed call that charged nothing must not read as spend.
insert into public.gap_lookups (target, rows_returned, units_charged, http_status, error)
values ('nowhere.test', 0, 0, 429, 'Rate limited');
select 'a free failure costs nothing: ' || (public.gap_units_this_cycle() = 2500);

-- Last cycle is excluded.
insert into public.gap_lookups (target, units_charged, created_at)
values ('oldcycle.com', 99999, timezone('utc', now()) - interval '70 days');
select 'last cycle is excluded: ' || (public.gap_units_this_cycle() = 2500);

-- --------------------------------------------------- per-account run limit --
insert into public.gap_runs (user_id, target_domain, competitor_domains, status)
select '33333333-3333-3333-3333-333333333333', 'mine.com', array['a.com'], 'completed'
from generate_series(1, 3);

select 'three runs counted for this account: ' ||
  (public.gap_runs_this_cycle('33333333-3333-3333-3333-333333333333') = 3);
select 'and none for another: ' ||
  (public.gap_runs_this_cycle('44444444-4444-4444-4444-444444444444') = 0);

-- A refused run does not count against them. Being told no is not a go.
insert into public.gap_runs (user_id, target_domain, status, status_reason)
values ('33333333-3333-3333-3333-333333333333', 'mine.com', 'refused', 'Out of budget');
select 'a refused run is not counted: ' ||
  (public.gap_runs_this_cycle('33333333-3333-3333-3333-333333333333') = 3);

-- ------------------------------------------------------- what we can sell --
insert into public.websites (slug, domain, title, country_code, country_source, status, domain_rating, organic_traffic)
values
  ('ours-one', 'ours-one.com', 'Ours One', 'GB', 'stated', 'active', 61, 48000),
  ('ours-two', 'ours-two.com', 'Ours Two', 'GB', 'stated', 'active', 44, 19000),
  ('ours-paused', 'ours-paused.com', 'Paused', 'GB', 'stated', 'paused', 70, 90000),
  ('ours-unpriced', 'ours-unpriced.com', 'No service', 'GB', 'stated', 'active', 66, 30000),
  ('ours-free', 'ours-free.com', 'Priced at nothing', 'GB', 'stated', 'active', 59, 12000),
  ('ours-withdrawn', 'ours-withdrawn.com', 'Service off', 'GB', 'stated', 'active', 72, 44000);

/*
  A price is what makes a listing an offer, and the price lives on `services`.

  `ours-unpriced` deliberately gets none at all. The other two get a service
  that cannot be bought: one at zero, one marked unavailable.
*/
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 18000, true from public.websites where slug = 'ours-one';
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 9000, true from public.websites where slug = 'ours-two';
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 25000, true from public.websites where slug = 'ours-paused';
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 0, true from public.websites where slug = 'ours-free';
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 30000, false from public.websites where slug = 'ours-withdrawn';

/*
  `coalesce`, so an empty answer is loud.

  This assertion printed the two domains until 0056 required a price, at which
  point the fixtures had no services and `string_agg` over no rows returned
  null - the line went blank and the verifier's own `grep -v '^$'` swallowed
  it. A check that stops checking has to say so.
*/
select 'our active priced sites are found: ' ||
  coalesce(string_agg(domain, ',' order by domain), '(NONE - CHECK STOPPED CHECKING)')
from public.gap_sellable(array['ours-one.com', 'ours-two.com', 'stranger.com']);

/*
  0056: active is not the same as orderable.

  Before it, `gap_sellable` checked only `status`, though its comment claimed
  otherwise. The report then counted these three under "you can order these
  today" and, once the row grew an Add to order button, would have shown that
  claim above a row with no button under it.
*/
select 'a listing with no service at all is not offered: ' ||
  (count(*) = 0) from public.gap_sellable(array['ours-unpriced.com']);
select 'nor one priced at nothing: ' ||
  (count(*) = 0) from public.gap_sellable(array['ours-free.com']);
select 'nor one whose only service is switched off: ' ||
  (count(*) = 0) from public.gap_sellable(array['ours-withdrawn.com']);

/*
  A paused listing is not an offer.

  Listing one as available is a promise somebody has to retract, and the
  retraction happens after the customer has picked it.
*/
select 'a paused listing is not offered: ' ||
  (count(*) = 0) from public.gap_sellable(array['ours-paused.com']);
select 'a domain we do not hold is not invented: ' ||
  (count(*) = 0) from public.gap_sellable(array['stranger.com']);
select 'an empty list is handled: ' || (count(*) = 0) from public.gap_sellable(array[]::text[]);

-- -------------------------------------------------------------- the cache --
insert into public.refdomain_snapshots (domain, domains, row_count, truncated, units_charged)
values ('competitor.com', array['ours-one.com', 'stranger.com'], 2, false, 2500);
select 'a snapshot holds its domains: ' ||
  (array_length(domains, 1) = 2) from public.refdomain_snapshots where domain = 'competitor.com';
select 'and what it cost: ' ||
  (units_charged = 2500) from public.refdomain_snapshots where domain = 'competitor.com';

-- ------------------------------------------- a customer reads their own --
insert into public.gap_runs (id, user_id, target_domain, status, gaps_found, sellable_found)
values ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'mine.com', 'completed', 2, 1);
insert into public.gap_results (run_id, domain, website_id, linking_competitors)
select '55555555-5555-5555-5555-555555555555', 'ours-one.com', id, array['a.com']
from public.websites where slug = 'ours-one';

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'a customer reads their own run: ' || (count(*) = 1)
from public.gap_runs where id = '55555555-5555-5555-5555-555555555555';
select 'and their own results: ' || (count(*) = 1) from public.gap_results;

-- Somebody else's report is not theirs.
reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select 'another customer sees no runs: ' || count(*)
from public.gap_runs where id = '55555555-5555-5555-5555-555555555555';
select 'and no results: ' || count(*) from public.gap_results;

/*
  The cache, the ledger and the budget are ours.

  A customer reading the cache would be reading data we paid for; reading the
  ledger would be reading our cost. Neither has a customer-facing policy, the
  way AGENTS.md requires of every internal table.
*/
select 'a customer reads the cache: ' || count(*) from public.refdomain_snapshots;
select 'a customer reads the ledger: ' || count(*) from public.gap_lookups;
select 'a customer reads the gap settings: ' || count(*) from public.gap_settings;
reset role; reset request.jwt.claim.sub;

set role anon;
select 'anon reads runs: ' || count(*) from public.gap_runs;
select 'anon reads results: ' || count(*) from public.gap_results;
select 'anon reads the cache: ' || count(*) from public.refdomain_snapshots;
reset role;

-- Nobody but the service role may ask what we can sell, or what has been
-- spent: both read the whole inventory or the whole ledger.
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
declare v record;
begin
  select * into v from public.gap_sellable(array['ours-one.com']);
  raise notice 'a customer may ask what we sell: allowed';
exception
  when insufficient_privilege then raise notice 'a customer asking what we sell is refused: true';
end;
$$;
do $$
declare v integer;
begin
  select public.gap_units_this_cycle() into v;
  raise notice 'a customer may read the spend: allowed';
exception
  when insufficient_privilege then raise notice 'a customer reading the spend is refused: true';
end;
$$;
reset role; reset request.jwt.claim.sub;
