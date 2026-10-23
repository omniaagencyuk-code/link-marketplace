-- ---------------------------------------------------------------------------
-- 0093  Counting a niche without downloading the inventory to do it
--
-- /guest-posts renders a directory of the niches that have enough listings to
-- deserve a page of their own. Working out which those are read **every active
-- listing** - `websiteService.getAll()`, about twelve thousand rows with their
-- category joins, in thirteen sequential paged requests - and then counted
-- them in JavaScript.
--
-- Postgres has been killing it since the 14th of October:
--
--   Failed to load the marketplace: canceling statement due to statement
--   timeout            count=6  routes=/guest-posts.rsc
--
-- Intermittent because the page is ISR on a ten minute revalidate, so the read
-- only runs when the cache expires, and it fails when the database is busy
-- enough for one of those thirteen pages to run past the statement timeout.
-- When it fails the whole page 500s.
--
-- ## What this is
--
-- The same move 0077 made for the marketplace's facets and 0083 made for the
-- planner's totals: count in the database. One round trip, a grouped count,
-- and no row crosses the wire that is not an answer.
--
-- ## The rule it has to match
--
-- A listing counts under its primary niche **and** under each of its
-- secondary ones, because that is what a niche page shows - the same rule
-- `inNiche` applies in `marketplace/topic.ts`. `countByNiche` counts primary
-- only and is the wrong rule here: Finance had seven primary and ten in
-- total, so the page rendered and the sitemap never mentioned it.
--
-- Read off `marketplace_listings`, which already encodes both halves plus
-- 0077's rule that a listing with no category counts under nothing rather
-- than under technology. A second expression of those rules here would be a
-- second place for them to drift.
--
-- `verify:search` asserts this function and the in-memory filter agree on the
-- same fixtures, because a counting query that quietly disagrees does not
-- fail - it publishes a different set of niche pages and says nothing.
--
-- ## Who may call it
--
-- The service role, on the terms 0090 set for every function that reads the
-- inventory. The figures it returns are printed on a public page, but the
-- page reads them through the service-role client like everything else, and a
-- function the anon key can call is a function somebody can walk.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.niche_page_counts()
returns table (niche text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select n.slug, count(distinct m.id)
    from public.marketplace_listings m
    cross join lateral (
      /*
        The primary, where there is one.

        `where m.niche is not null` is the only guard needed against a
        nameless row in the output: `categories.slug` is `not null`, so
        `unnest(m.secondary_niches)` cannot produce one. A second `n.slug is
        not null` below was tried and removed - nothing could make it fire,
        and a clause no input can reach is a clause nobody can check.
      */
      select m.niche as slug where m.niche is not null
      union
      -- ...and every secondary. `union` rather than `union all` so a listing
      -- carrying the same slug twice is still one listing in that niche.
      select unnest(m.secondary_niches) as slug
    ) n
   where m.status = 'active'
   group by n.slug;
$$;

comment on function public.niche_page_counts() is
  'Active listings per niche, counting primary and secondary - the rule a niche page shows. Replaces reading every listing to count them.';

/*
  The same lock-down 0090 applied to the functions that read the inventory.
  Postgres grants EXECUTE to PUBLIC by default, so revoking from anon and
  authenticated alone leaves the door open.
*/
revoke all on function public.niche_page_counts() from public, anon, authenticated;
grant execute on function public.niche_page_counts() to service_role;
