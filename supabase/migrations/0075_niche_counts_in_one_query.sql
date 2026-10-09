-- ---------------------------------------------------------------------------
-- 0075  Count the niches in the database
--
-- The homepage's niche cards each carry a number, and `countByNiche` produced
-- them by reading every active listing and counting the rows in JavaScript.
-- It is paged, correctly, which is the problem: 3,405 active listings at 500
-- a page is seven requests, one after another, before the page can render.
--
-- They are sequential by construction - each asks for the rows after the ones
-- that arrived - so no amount of server makes them fewer, and the four reads
-- the homepage starts in parallel all wait for the slowest, which is this
-- one. It is the last read on the site still walking the whole marketplace to
-- produce a handful of numbers; 0064 did it for search, 0073 for the niche
-- pages, and this is the homepage's turn.
--
-- `group by` is what this was always asking for. One request, one pass, and
-- the counts arrive already counted.
--
-- ## Who may call it
--
-- `security definer`, granted to anon, like `marketplace_stats` and
-- `marketplace_niche_preview`. The homepage is public and a signed-out
-- visitor cannot read `websites` directly, which is the point of the gate -
-- and nothing here can leak a listing, because it selects no column of one.
-- A category slug and a count is all that leaves.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.marketplace_niche_counts()
returns table (niche text, listings bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.slug as niche, count(*) as listings
  from public.websites w
  join public.categories c on c.id = w.primary_category_id
  where w.status = 'active'
  group by c.slug;
$$;

comment on function public.marketplace_niche_counts() is
  'How many active listings sit in each primary category. Replaces reading every active listing and counting them in JavaScript - seven sequential requests to draw the homepage''s niche cards.';

revoke all on function public.marketplace_niche_counts() from public;
grant execute on function public.marketplace_niche_counts() to anon, authenticated, service_role;
