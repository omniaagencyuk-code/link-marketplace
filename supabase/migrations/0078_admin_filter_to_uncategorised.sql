-- ---------------------------------------------------------------------------
-- 0078  Find the listings with no category
--
-- 0077 stopped the marketplace calling an uncategorised listing a technology
-- site. That was the correctness half. This is the other half: 1,840 of
-- 12,190 active listings have no primary category, and until now there was
-- no way to ask the admin table for them.
--
-- Without it the backlog is visible one row at a time and workable not at
-- all. The table pages server-side, so a filter applied in the browser would
-- narrow the fifty rows in hand and call it an answer - which is what the
-- "listings selling below cost" toggle beside it does, and is tolerable there
-- only because that set is small.
--
-- ## Both functions, because the checkbox means what it says
--
-- `admin_website_page` returns the page. `admin_website_ids` returns every id
-- the filter matches, which is what makes the header checkbox mean
-- "everything these filters match" rather than "this page". A filter added to
-- one and not the other would quietly break that promise: tick the box with
-- the filter on, and you would select the page.
--
-- Both signatures change, so both are dropped first rather than left beside
-- an overload. Two functions differing only by defaults make every named call
-- ambiguous, which is how 0068 broke `admin_website_ids` - and every caller
-- here uses named arguments.
--
-- ## A boolean, not a category picker
--
-- The need is "show me the ones nobody has filed", and a boolean answers it.
-- A full category filter is a bigger control nobody has asked for, and it
-- would have to decide what a listing filed under two categories does.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_website_page(text, text, integer, integer);

create or replace function public.admin_website_page(
  p_search text default null,
  p_status text default null,
  -- Only listings with no primary category. `not coalesce(...)` so the
  -- filter is off unless it is asked for, the shape `p_verified` uses in
  -- `marketplace_search`.
  p_uncategorised boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select w.id, w.updated_at
    from public.websites w
    left join public.categories c on c.id = w.primary_category_id
    where (p_status is null or p_status = 'all' or w.status::text = p_status)
      and (not coalesce(p_uncategorised, false) or w.primary_category_id is null)
      and (
        coalesce(btrim(p_search), '') = ''
        or position(
             lower(btrim(p_search)) in
             lower(w.domain || ' ' || coalesce(w.title, '') || ' ' || coalesce(c.slug, ''))
           ) > 0
      )
  )
  select matched.id, count(*) over () as total
  from matched
  -- The order the full read arrived in, so the table is unchanged by this.
  order by matched.updated_at desc, matched.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 250))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_website_page(text, text, boolean, integer, integer) is
  'One page of the admin website table. Returns ids and the total; the caller maps the rows with the admin select it already has. p_uncategorised narrows to listings with no primary category.';

drop function if exists public.admin_website_ids(text, text, integer, integer);

create or replace function public.admin_website_ids(
  p_search text default null,
  p_status text default null,
  p_uncategorised boolean default false,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select w.id
  from public.websites w
  left join public.categories c on c.id = w.primary_category_id
  where (p_status is null or p_status = 'all' or w.status::text = p_status)
    and (not coalesce(p_uncategorised, false) or w.primary_category_id is null)
    and (
      coalesce(btrim(p_search), '') = ''
      or position(
           lower(btrim(p_search)) in
           lower(w.domain || ' ' || coalesce(w.title, '') || ' ' || coalesce(c.slug, ''))
         ) > 0
    )
  -- Total, so the walk is stable. Paging by offset over an order the database
  -- may break ties in differently each time skips rows and repeats others.
  order by w.updated_at desc, w.id asc
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_website_ids(text, text, boolean, integer, integer) is
  'One window of the listing ids an admin filter matches, for the header checkbox that selects a whole filter rather than a page. Ids only, and the caller walks it to the end - PostgREST caps a single response and does not say so.';

/*
  Unreachable by anyone but the service role, as before.

  The admin signs in with a shared password and carries no `auth.uid()`, so
  `is_admin()` is false and row level security would hand them nothing - which
  is why every admin read goes through the service role, and why these must
  stay closed to everybody else. The list of what we have not published yet is
  not public, and neither is the list of what nobody has categorised.

  Restated here rather than inherited: a dropped function takes its grants
  with it, so the recreated one starts from the default, which is execute for
  public.
*/
revoke all on function public.admin_website_page(text, text, boolean, integer, integer) from public;
revoke all on function public.admin_website_page(text, text, boolean, integer, integer) from anon;
revoke all on function public.admin_website_page(text, text, boolean, integer, integer) from authenticated;

revoke all on function public.admin_website_ids(text, text, boolean, integer, integer) from public;
revoke all on function public.admin_website_ids(text, text, boolean, integer, integer) from anon;
revoke all on function public.admin_website_ids(text, text, boolean, integer, integer) from authenticated;
