-- ---------------------------------------------------------------------------
-- A paged read needs an order
-- ---------------------------------------------------------------------------
--
-- 0095 moved the niche page's listings into `niche_page_listings` and the
-- page immediately told on itself: /guest-posts/business went from "4,361
-- live listings" to "1,000", with the starting price and the domain rating
-- range taken over whichever thousand arrived.
--
-- A thousand is not a number that occurs in this inventory. It is
-- PostgREST's row cap, which it applies without saying so - the cap
-- `supabase/.../paged.ts` exists to defeat, and which a function returning a
-- table does nothing to escape: the response is still a PostgREST response.
-- The fix on that side is to page the call like every other full read.
--
-- Which is why this exists. Paging by offset over an unordered result is the
-- failure `paged.ts` describes in its own comment: "paging by offset over an
-- order the database is free to break ties in differently on each request
-- skips some rows and returns others twice". Every other full read in that
-- file ends `order by ... , id` for exactly this reason, and the function
-- shipped without one.
--
-- `id` alone, because nothing downstream wants a particular order - the page
-- sorts by domain rating itself - and a primary key is both unique and the
-- cheapest thing to walk.
--
-- The order lives here rather than on the call so that no caller can forget
-- it. A `.range()` without an `order` is the quiet version of this bug, and
-- it would read as working right up to the second page.

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
    and (m.niche = p_niche or p_niche = any(m.secondary_niches))
  order by m.id;
$$;

comment on function public.niche_page_listings(text) is
  'The active listings in one niche, with their services, for /guest-posts/<niche>. Primary or secondary, following 0077. Ordered by id because the caller pages it - PostgREST caps a response at a thousand rows whether or not a function produced them.';

revoke all on function public.niche_page_listings(text) from public, anon, authenticated;
grant execute on function public.niche_page_listings(text) to service_role;
