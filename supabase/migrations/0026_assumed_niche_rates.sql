-- ============================================================================
-- 0026  An assumed topic costs what sensitive content costs
-- ============================================================================
-- A sensitive niche the publisher never mentioned is still sold - that is a
-- deliberate commercial choice and it is not changing here. What changes is
-- what we believe it costs us.
--
-- Until now an unmentioned niche had no row in `website_niche_costs`, so every
-- figure downstream priced it off the general rate. A publisher quoting 550
-- EUR generally and 700 EUR for "casino / CBD / poker / gambling" would have
-- crypto sold at a markup over 550 and invoiced at 700, and nothing anywhere
-- would have said so: the margin report reads the same cost the engine did.
--
-- So the assumption is now written down, at the publisher's own sensitive
-- rate, and marked as an assumption.
--
-- Nothing is invented where there is nothing to go on. A reply quoting one
-- number and no sensitive rate leaves its niches exactly as they are - a lone
-- price is not a sensitive-topic price, and `single-price-confirm-niches`
-- already puts that draft in front of a human.
--
-- Reversible: `supabase/rollbacks/0026_assumed_niche_rates_down.sql` deletes
-- every row this created and drops the column. The rows are identifiable
-- precisely because the column exists.
-- ============================================================================

alter table public.website_niche_costs
  add column if not exists assumed boolean not null default false;

comment on column public.website_niche_costs.assumed is
  'True when this is the publishers sensitive rate applied to a topic they never mentioned, rather than a price they quoted. Priced off, but never reported as a quote.';

-- --------------------------------------------------------------- backfill --
-- Listings already in the marketplace, from the data already recorded about
-- them: `website_niche_policy` kept the stated answer per niche, so "they said
-- yes", "they said no" and "nobody asked" are still distinguishable.
--
-- A row is created only where all of these hold:
--   - the publisher never stated a position on that niche      (accepted = unknown)
--   - the listing actually sells it                            (accepted_niches)
--   - they quoted a sensitive rate for some other niche        (the max below)
--   - that niche has no cost of its own for that link type     (not exists)
--
-- The rate is the highest they quoted for any sensitive niche of that link
-- type. Guessing low is the guess that loses money quietly.

insert into public.website_niche_costs (website_id, niche, link_type, cost_minor, assumed, updated_by)
select policy.website_id, policy.niche, quoted.link_type, quoted.rate, true, 'migration 0026'
from public.website_niche_policy as policy
join public.websites as site on site.id = policy.website_id
join lateral (
  select existing.link_type, max(existing.cost_minor) as rate
  from public.website_niche_costs as existing
  where existing.website_id = policy.website_id and existing.assumed = false
  group by existing.link_type
) as quoted on true
where policy.accepted = 'unknown'
  and policy.niche = any (site.accepted_niches)
  and site.status <> 'archived'
  and not exists (
    select 1 from public.website_niche_costs as own
    where own.website_id = policy.website_id
      and own.niche = policy.niche
      and own.link_type = quoted.link_type
  )
on conflict (website_id, niche, link_type) do nothing;
