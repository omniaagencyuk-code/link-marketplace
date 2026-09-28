-- ============================================================================
-- 0032  A listing must never be buyable at nothing
-- ============================================================================
-- Some publishers never quoted a standard rate. They answered the question
-- that was asked - "what for gambling?" - gave one number, and the listing
-- ended up with a price for gambling and nothing for an ordinary guest post.
--
-- The engine had no general cost to work from, so the general placement
-- priced at zero. And zero does not read as "not priced yet" to a buyer: it
-- reads as free, with an Add to order button under it. us.modalova.com was
-- live on the marketplace at US$0 with seven niche prices of US$499 beside
-- it.
--
-- Two fixes, in this order:
--
--   1. Give those listings a general cost, taken as the cheapest sensitive
--      rate the publisher actually quoted. Cheapest because a sensitive topic
--      is what a publisher charges MORE for - their standard rate is at most
--      the lowest of those, so this cannot invent a price below anything they
--      said. It can only be conservative.
--
--   2. Switch off any placement still priced at zero. This is the backstop,
--      and it runs whether or not step one found a cost: a placement nobody
--      has priced must not be buyable, and "switched off" is what the
--      marketplace already understands.
--
-- Recalculate prices after running this. Step one writes what we PAY; the
-- sell price does not move until the engine runs.
--
-- Reversible: supabase/rollbacks/0032_general_price_from_niches_down.sql
-- The rollback cannot know which placements were switched off here rather
-- than by hand, so it restores the costs only and says so.
-- ============================================================================

-- ------------------------------------------- a general cost, where missing --
-- Only where the service has no cost row at all, or one with nothing in it.
-- A cost somebody typed is never overwritten.

insert into public.service_costs (service_id, cost_price_minor, updated_by)
select service.id, cheapest.rate, 'migration 0032'
from public.services as service
join lateral (
  select min(niche.cost_minor) as rate
  from public.website_niche_costs as niche
  where niche.website_id = service.website_id
    and niche.link_type = service.type
    and niche.assumed = false
) as cheapest on cheapest.rate is not null
where not exists (
  select 1 from public.service_costs as existing
  where existing.service_id = service.id and coalesce(existing.cost_price_minor, 0) > 0
)
on conflict (service_id) do update set cost_price_minor = excluded.cost_price_minor
where coalesce(public.service_costs.cost_price_minor, 0) = 0;

-- ---------------------------------------------- nothing buyable at nothing --
-- The backstop. A placement with no price is switched off, so it cannot be
-- ordered while somebody works out what it should cost.

update public.services
   set available = false
 where available = true
   and price_minor <= 0;

-- A listing whose every placement is now off is not sellable, and an active
-- listing that sells nothing is a page a customer can reach and not buy from.
update public.websites as site
   set status = 'draft'
 where site.status = 'active'
   and not exists (
     select 1 from public.services as service
     where service.website_id = site.id
       and service.available = true
       and service.price_minor > 0
   );
