\pset tuples_only on
\pset format unaligned

-- The backfill in 0026, run against listings built to catch the ways it could
-- be wrong. It runs the migration file itself rather than a copy of its SQL,
-- so what is tested here is what gets pasted into the SQL editor.

-- A publisher who quoted a standard rate and a premium for sensitive topics,
-- said yes to gambling, no to adult, and never mentioned crypto.
insert into public.websites (slug, domain, title, country_code, country_source, status, accepted_niches)
values ('premium-example', 'premium.example', 'Premium', 'GB', 'stated', 'active', '{gambling,cbd,crypto}');

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
insert into public.websites (slug, domain, title, country_code, country_source, status, accepted_niches)
values ('flat-example', 'flat.example', 'Flat', 'GB', 'stated', 'active', '{gambling,crypto}');
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

-- ------------------------------------ nothing buyable at nothing (0032) --
-- The shape that reached the marketplace at US$0: a publisher who priced
-- gambling and never stated a standard rate, so the general placement had no
-- cost and priced at zero.

insert into public.websites (slug, domain, title, country_code, country_source, status, accepted_niches)
values ('niche-only-example', 'niche-only.example', 'Niche Only', 'GB', 'stated', 'active', '{gambling,cbd}');

insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 0, true from public.websites where slug = 'niche-only-example';

insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'gambling', 'guest-post', 49900 from public.websites where slug = 'niche-only-example';
insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'cbd', 'guest-post', 65000 from public.websites where slug = 'niche-only-example';

\ir ../migrations/0032_general_price_from_niches.sql

select 'the general cost is the cheapest niche rate: ' || cost_price_minor
  from public.service_costs cost
  join public.services service on service.id = cost.service_id
  join public.websites site on site.id = service.website_id
  where site.slug = 'niche-only-example';

select 'a placement priced at zero is switched off: ' || available
  from public.services service
  join public.websites site on site.id = service.website_id
  where site.slug = 'niche-only-example';

select 'and a listing that sells nothing is not active: ' || status
  from public.websites where slug = 'niche-only-example';

-- A cost somebody already recorded is never overwritten by the assumption.
insert into public.websites (slug, domain, title, country_code, country_source, status)
values ('priced-example', 'priced.example', 'Priced', 'GB', 'stated', 'active');
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 30000, true from public.websites where slug = 'priced-example';
insert into public.service_costs (service_id, cost_price_minor)
select service.id, 12000 from public.services service
  join public.websites site on site.id = service.website_id
  where site.slug = 'priced-example';
insert into public.website_niche_costs (website_id, niche, link_type, cost_minor)
select id, 'gambling', 'guest-post', 20000 from public.websites where slug = 'priced-example';

\ir ../migrations/0032_general_price_from_niches.sql

select 'a recorded cost is left alone: ' || cost_price_minor
  from public.service_costs cost
  join public.services service on service.id = cost.service_id
  join public.websites site on site.id = service.website_id
  where site.slug = 'priced-example';
select 'and a priced listing stays active: ' || status
  from public.websites where slug = 'priced-example';
