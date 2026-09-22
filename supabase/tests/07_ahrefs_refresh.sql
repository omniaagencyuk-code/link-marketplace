\pset tuples_only on
\pset format unaligned

-- 0014 resized the tiers to an inventory that exists rather than an assumed
-- 37,700, and there is no measured cost until a live run has produced one.
select 'default tier sizes: ' || tier1_size || '/' || tier2_size from public.refresh_settings;
select 'no measured cost before any run: ' || (public.ahrefs_units_per_domain_actual() is null);
select 'no usage reading before any run: ' || (select count(*) = 0 from public.ahrefs_latest_usage());

-- Small tiers so a handful of fixtures exercises all three.
update public.refresh_settings
   set tier1_size = 2, tier2_size = 2,
       tier1_interval_days = 7, tier2_interval_days = 14, tier3_interval_days = 30;

insert into public.websites (slug, domain, title, country_code, status, domain_rating, organic_traffic)
values
  ('a-com', 'a.com', 'A', 'GB', 'active', 90, 500000),
  ('b-com', 'b.com', 'B', 'GB', 'active', 80, 400000),
  ('c-com', 'c.com', 'C', 'GB', 'active', 70, 300000),
  ('d-com', 'd.com', 'D', 'GB', 'active', 60, 200000),
  ('e-com', 'e.com', 'E', 'GB', 'active', 50, 100000),
  ('f-com', 'f.com', 'F', 'GB', 'archived', 95, 900000);

select 'tiers assigned: ' || tier1 || '/' || tier2 || '/' || tier3 from public.assign_ahrefs_tiers();
select 'highest DR is tier ' || ahrefs_tier from public.websites where slug = 'a-com';
select 'lowest DR is tier ' || ahrefs_tier from public.websites where slug = 'e-com';
select 'archived left unassigned: ' || (ahrefs_tier is null) from public.websites where slug = 'f-com';

-- Never refreshed means overdue.
select 'overdue tier ' || tier || ': ' || overdue || ' of ' || total from public.ahrefs_overdue_counts();

-- A fresh refresh stops it being due; an old one does not.
update public.websites set last_ahrefs_refresh_at = timezone('utc', now()) where slug = 'a-com';
update public.websites set last_ahrefs_refresh_at = timezone('utc', now()) - interval '10 days' where slug = 'b-com';
select 'due list: ' || string_agg(domain, ',' order by domain) from public.ahrefs_due_domains(10);
select 'just-refreshed tier 1 is not due: ' || (count(*) = 0) from public.ahrefs_due_domains(10) where domain = 'a.com';
select '10-day-old tier 1 IS due: ' || (count(*) = 1) from public.ahrefs_due_domains(10) where domain = 'b.com';

-- Order: never-refreshed first, then tier, then most overdue.
select 'first due is never-refreshed: ' || (tier <= 2) from public.ahrefs_due_domains(1);

-- A tier pinned by hand survives a rebalance.
update public.websites set ahrefs_tier = 1, ahrefs_tier_locked = true where slug = 'e-com';
select public.assign_ahrefs_tiers();
select 'locked tier survives rebalance: ' || (ahrefs_tier = 1) from public.websites where slug = 'e-com';

-- Budget accounting.
select 'units this cycle starts at: ' || public.ahrefs_units_this_cycle();
insert into public.refresh_runs (status, units_spent, domains_refreshed, finished_at)
values ('completed', 1200, 100, timezone('utc', now()));
select 'units after a run: ' || public.ahrefs_units_this_cycle();
insert into public.refresh_runs (status, units_spent, started_at, finished_at)
values ('completed', 999999, timezone('utc', now()) - interval '70 days', timezone('utc', now()) - interval '70 days');
select 'last cycle is excluded: ' || (public.ahrefs_units_this_cycle() = 1200);

-- Cost per domain is measured from what Ahrefs actually charged, not from the
-- configured estimate. 1200 units over 100 domains is 12.
select 'measured cost per domain: ' || round(public.ahrefs_units_per_domain_actual(), 2);
insert into public.refresh_runs (status, dry_run, units_spent, domains_refreshed, finished_at)
values ('completed', true, 99999, 1, timezone('utc', now()));
select 'a dry run is not evidence of cost: ' || (round(public.ahrefs_units_per_domain_actual(), 2) = 12);

-- The live reading from Ahrefs, kept beside the run that took it.
update public.refresh_runs
   set ahrefs_units_used = 31498,
       ahrefs_units_limit = 2000000,
       ahrefs_usage_reset_at = timezone('utc', now()) + interval '15 days'
 where units_spent = 1200;
select 'latest usage: ' || units_used || ' of ' || units_limit from public.ahrefs_latest_usage();

-- ------------------------------------------------------------- projection --
-- Counted from the rows that exist and the cost that was measured, so a
-- cadence nobody can afford is visible before a run proves it.
create temp table projection as select public.ahrefs_projected_monthly_units() as before;
select 'projection is above zero: ' || (select before > 0 from projection);

update public.refresh_settings
   set tier1_interval_days = tier1_interval_days * 2,
       tier2_interval_days = tier2_interval_days * 2,
       tier3_interval_days = tier3_interval_days * 2;
select 'doubling every interval halves the projection: ' ||
  (abs(public.ahrefs_projected_monthly_units() - (select before from projection) / 2.0) <= 3);
update public.refresh_settings
   set tier1_interval_days = tier1_interval_days / 2,
       tier2_interval_days = tier2_interval_days / 2,
       tier3_interval_days = tier3_interval_days / 2;

insert into public.websites (slug, domain, title, country_code, status, domain_rating, organic_traffic)
values ('g-com', 'g.com', 'G', 'GB', 'active', 40, 50000);
select 'a new domain raises the projection: ' ||
  (public.ahrefs_projected_monthly_units() > (select before from projection));
create temp table projection_with_g as select public.ahrefs_projected_monthly_units() as units;
insert into public.websites (slug, domain, title, country_code, status, domain_rating, organic_traffic)
values ('h-com', 'h.com', 'H', 'GB', 'archived', 99, 990000);
select 'an archived domain does not: ' ||
  (public.ahrefs_projected_monthly_units() = (select units from projection_with_g));

-- Only one run at a time.
select 'first claim succeeds: ' || (public.start_refresh_run(false) is not null);
select 'second claim refused: ' || (public.start_refresh_run(false) is null);
update public.refresh_runs set status = 'completed', finished_at = timezone('utc', now()) where status = 'running';
select 'claim available once finished: ' || (public.start_refresh_run(false) is not null);

-- A run abandoned mid-flight must not block the job forever.
update public.refresh_runs set started_at = timezone('utc', now()) - interval '3 hours' where status = 'running';
select 'stale run is reclaimed: ' || (public.start_refresh_run(false) is not null);

-- Nobody but an admin sees any of this.
set role anon;
select 'anon reads settings: ' || count(*) from public.refresh_settings;
select 'anon reads runs: ' || count(*) from public.refresh_runs;
reset role;
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads settings: ' || count(*) from public.refresh_settings;
reset role; reset request.jwt.claim.sub;
