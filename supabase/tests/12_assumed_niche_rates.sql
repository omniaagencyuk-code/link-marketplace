\pset tuples_only on
\pset format unaligned

-- The backfill in 0026, run against listings built to catch the ways it could
-- be wrong. It runs the migration file itself rather than a copy of its SQL,
-- so what is tested here is what gets pasted into the SQL editor.

-- A publisher who quoted a standard rate and a premium for sensitive topics,
-- said yes to gambling, no to adult, and never mentioned crypto.
insert into public.websites (slug, domain, title, country_code, status, accepted_niches)
values ('premium-example', 'premium.example', 'Premium', 'GB', 'active', '{gambling,cbd,crypto}');

insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'gambling', 'guest-post', 70000 from public.websites where slug = 'premium-example';
insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'cbd', 'guest-post', 60000 from public.websites where slug = 'premium-example';
insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'gambling', 'niche-edit', 40000 from public.websites where slug = 'premium-example';

insert into public.website_niche_policy (website_id, niche, accepted)
select id, 'gambling', 'yes' from public.websites where slug = 'premium-example';
insert into public.website_niche_policy (website_id, niche, accepted)
select id, 'crypto', 'unknown' from public.websites where slug = 'premium-example';
insert into public.website_niche_policy (website_id, niche, accepted)
select id, 'adult', 'no' from public.websites where slug = 'premium-example';
-- Silence, but the listing does not sell it: nothing should be costed.
insert into public.website_niche_policy (website_id, niche, accepted)
select id, 'dating', 'unknown' from public.websites where slug = 'premium-example';

-- A publisher who quoted one number and named no sensitive rate at all.
insert into public.websites (slug, domain, title, country_code, status, accepted_niches)
values ('flat-example', 'flat.example', 'Flat', 'GB', 'active', '{gambling,crypto}');
insert into public.website_niche_policy (website_id, niche, accepted)
select id, 'crypto', 'unknown' from public.websites where slug = 'flat-example';

\ir ../migrations/0026_assumed_niche_rates.sql

-- The topic nobody mentioned is costed at the highest sensitive rate quoted,
-- per placement type: 700 for a guest post, 400 for a link insertion.
select 'crypto guest post costed at: ' || cost_minor
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'crypto' and c.link_type = 'guest-post';
select 'crypto link insertion costed at: ' || cost_minor
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'crypto' and c.link_type = 'niche-edit';

-- And it is marked as ours, not theirs.
select 'crypto is marked assumed: ' || bool_and(assumed)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'crypto';

-- A price they actually quoted is untouched, and still reads as quoted.
select 'gambling still costs: ' || cost_minor || ', assumed=' || assumed
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'gambling' and c.link_type = 'guest-post';

-- A refusal is never costed: it is not sold, so there is nothing to price.
select 'adult rows created: ' || count(*)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'adult';

-- Nor is a topic the listing does not sell, whatever the policy row says.
select 'dating rows created: ' || count(*)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'dating';

-- A lone price is not a sensitive-topic price. Nothing is invented from it.
select 'flat listing rows created: ' || count(*)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'flat-example';

-- Run it again, as a half-finished paste would be. Same rows, same values.
\ir ../migrations/0026_assumed_niche_rates.sql

select 'crypto rows after a second run: ' || count(*)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example' and c.niche = 'crypto';

-- The rollback removes exactly what was assumed and nothing that was quoted.
delete from public.website_niche_costs where assumed;
select 'quoted rows surviving the rollback: ' || count(*)
  from public.website_niche_costs c join public.websites w on w.id = c.website_id
  where w.slug = 'premium-example';
