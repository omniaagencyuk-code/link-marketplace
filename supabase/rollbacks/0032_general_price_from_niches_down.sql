-- Undo 0032, as far as it can honestly be undone.
--
-- The costs it wrote are identifiable and are removed. The placements it
-- switched off and the listings it moved to draft are not: by the time
-- anybody runs this, some of those will have been switched off or drafted by
-- a human for their own reasons, and turning them all back on would put a
-- listing priced at nothing back in front of customers. Restoring those is a
-- deliberate act, one listing at a time.

delete from public.service_costs where updated_by = 'migration 0032';
