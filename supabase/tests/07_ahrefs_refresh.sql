\pset tuples_only on
\pset format unaligned

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
