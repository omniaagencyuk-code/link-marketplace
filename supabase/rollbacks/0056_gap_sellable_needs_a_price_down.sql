-- ---------------------------------------------------------------------------
-- Undo 0056.
--
-- DESTROYS: nothing. It restores the 0054 version of `gap_sellable`, which
-- returns any active listing whether or not anything on it can be bought.
--
-- The consequence is a report that counts sites it cannot sell under
-- "available here" and, on the results page, rows carrying that claim with no
-- Add to order button under them - which is the state 0056 was written to fix.
-- Only run it alongside code from before the expandable results table.
--
-- Reports already run are untouched either way: `gap_sellable` decides what a
-- future report counts, not what a stored one holds.
-- ---------------------------------------------------------------------------

create or replace function public.gap_sellable(p_domains text[])
returns table (website_id uuid, domain text, domain_rating smallint, organic_traffic integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.domain, w.domain_rating, w.organic_traffic
  from public.websites w
  where w.status = 'active'
    and w.domain = any (p_domains);
$$;

revoke all on function public.gap_sellable(text[]) from public;
revoke all on function public.gap_sellable(text[]) from anon;
revoke all on function public.gap_sellable(text[]) from authenticated;
