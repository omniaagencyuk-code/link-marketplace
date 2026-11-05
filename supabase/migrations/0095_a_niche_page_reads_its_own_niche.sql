-- ---------------------------------------------------------------------------
-- A niche page reads its own niche
-- ---------------------------------------------------------------------------
--
-- /guest-posts/<niche> asks two questions: is this niche big enough to have a
-- page, and what does the inventory in it look like. 0093 moved the first one
-- into the database after it had been timing out since the 14th of October.
-- The second was left reading every active listing - `*` with services, niche
-- prices, categories and topics joined on, paged in five hundreds - and then
-- filtering by niche in JavaScript.
--
-- At seventeen thousand listings that is thirty-five sequential round trips to
-- London to render one page, and on 3 November nine of those pages answered
-- `canceling statement due to statement timeout` to real visitors. They are
-- public and indexed, so Google was reading the same errors; and they are now
-- the destination of the link in every outbound email.
--
-- ## Why not `marketplace_niche_preview`
--
-- 0073 already solved this shape for the six-row preview, and the preview is
-- the wrong size rather than the wrong rule: it returns six ids and the page
-- needs every listing in the niche, because the lowest price and the domain
-- rating range are taken across all of them.
--
-- It is worth saying what this is NOT, because reading 0073 alone suggests
-- it: that definition carries `coalesce(pc.slug, 'technology')`, the rule
-- 0077 took out, and it looks like a disagreement waiting to be found. It is
-- not. 0077 redefines the function, migrations run in order, and the last
-- definition is the one that exists. All three rules on this page - the
-- counts, the preview and this - agree, and `40_a_niche_page_reads_its_own_niche`
-- asserts that rather than leaving it to be re-derived.
--
-- This reads `marketplace_listings`, which is where the post-0077 rule lives.
--
-- ## Why it returns services rather than a price
--
-- The page wants the lowest price in the niche. Which services count toward
-- that is a rule - available ones where any are available, every one where
-- none are, so a listing whose services are all paused still has a price
-- rather than reading as free - and it already exists, in `pricedServices`,
-- where `toListItem` and the sales drafter both read it. Computing a minimum
-- here would be a second copy of it in SQL, and the copy that drifted would
-- be the one quoting a price on a public page.
--
-- So the rows come back with their services attached and the existing rule is
-- applied to them in TypeScript. The expensive part was never the arithmetic.

create or replace function public.niche_page_listings(p_niche text)
returns table (
  id uuid,
  domain_rating integer,
  organic_traffic integer,
  country text,
  services jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.domain_rating,
    m.organic_traffic,
    m.country,
    /*
      Empty array rather than null for a listing with no services, so the
      caller maps one shape. `coalesce` outside the aggregate, because
      `jsonb_agg` over no rows returns null rather than '[]'.
    */
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', s.type,
            'price_minor', s.price_minor,
            'available', s.available
          )
        )
        from public.services s
        where s.website_id = m.id
      ),
      '[]'::jsonb
    ) as services
  from public.marketplace_listings m
  where m.status = 'active'
    /*
      The primary or any secondary - `inNiche`, and the same test
      `niche_page_counts` makes with its lateral union. Written as a
      predicate here because this asks about one niche rather than grouping
      every listing by all of theirs.

      `verify:rls` asserts the two agree: for every niche, the number of rows
      this returns equals the count that decides whether the page exists. A
      page published by one rule and rendered by another is a 404 in the
      sitemap, reported back as a crawl error, with nothing in the logs.
    */
    and (m.niche = p_niche or p_niche = any(m.secondary_niches));
$$;

comment on function public.niche_page_listings(text) is
  'The active listings in one niche, with their services, for /guest-posts/<niche>. Primary or secondary, following 0077 - not marketplace_niche_preview, which still coalesces a missing category to technology.';

/*
  The same lock-down 0090 applied to the functions that read the inventory.
  Postgres grants EXECUTE to PUBLIC by default, so revoking from anon and
  authenticated alone leaves the door open.
*/
revoke all on function public.niche_page_listings(text) from public, anon, authenticated;
grant execute on function public.niche_page_listings(text) to service_role;
