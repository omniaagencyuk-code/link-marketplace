-- ---------------------------------------------------------------------------
-- 0084  How many of our publishers already link to them
--
-- The Sales Centre's prospects arrive as a pasted list of domains. Where that
-- list comes from matters: the strongest source is the outgoing links of the
-- publishers we already sell, because a company with an in-content dofollow
-- link on a site we sell has demonstrably bought a link on a site we sell.
--
-- One such link is weak evidence - it could be a citation, a partner, a
-- fluke. The same company appearing across seven different publishers is not
-- a fluke, and that count is the single best signal we can have about a
-- prospect before spending anything on them. It costs no model tokens and no
-- Hunter credit; it falls out of combining the exports and counting.
--
-- So it is stored, and `scoring.ts` reads it.
--
-- ## Nullable, and null is not zero
--
-- Null means nobody counted - a prospect typed in by hand, or imported before
-- this column existed. Zero would mean we looked across our publishers and
-- found none, which is a different and much more negative statement. The
-- score gives null no points and says so in words, so an unobserved prospect
-- reads as unmeasured rather than as rejected. The same rule the niche
-- extraction, the planner's metrics and `websites.country` all follow.
--
-- Destroys nothing: one nullable column on a table that keeps its rows.
-- ---------------------------------------------------------------------------

alter table public.prospects
  add column if not exists placements_seen integer
    check (placements_seen is null or placements_seen >= 0);

comment on column public.prospects.placements_seen is
  'How many of our own publishers were seen linking to this company, counted by hand from Ahrefs exports. Null means nobody counted; it is not zero.';

/* Sorting a worklist by the strongest evidence first. Partial, because most
   prospects will not carry a count and an index over those rows is an index
   over nothing. */
create index if not exists prospects_placements_seen_idx
  on public.prospects (placements_seen desc)
  where placements_seen is not null;
