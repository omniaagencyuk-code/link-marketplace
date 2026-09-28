-- Undo 0026. Every row it created carries `assumed`, so the delete is exact:
-- no price the publisher actually quoted is touched. Re-run the pricing
-- recalculation afterwards to put the sell prices back where they were.

delete from public.website_niche_costs where assumed;

alter table public.website_niche_costs drop column if exists assumed;
