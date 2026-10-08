-- ---------------------------------------------------------------------------
-- 0068  The select-all id list, in pages
--
-- 0067 added `admin_website_ids` so the header checkbox could keep meaning
-- "everything these filters match". It returned every id in one go, and the
-- browser showed "1000 selected" against an inventory of 12,246.
--
-- Nothing was wrong with the function. PostgREST caps what one request
-- returns - a thousand rows on a Supabase project by default - and nothing in
-- the response says the cap was applied. The caller asked once and was handed
-- a thousand ids and no error.
--
-- `src/lib/services/supabase/paged.ts` exists for precisely this and says so
-- in its own header: the admin table once read `.limit(2000)` and displayed
-- "1000 websites". The caller now walks the list with `readAllPages`, which
-- advances by what arrived rather than by what it asked for, so a server cap
-- is handled instead of assumed.
--
-- For that walk the function needs a window. Taking `p_limit` and `p_offset`
-- changes its signature, so the two-argument version is dropped rather than
-- left behind as an overload that still truncates.
--
-- The per-call cap is a thousand, which is the figure PostgREST would impose
-- anyway. It is here so the limit is one the database states rather than one
-- a caller discovers.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_website_ids(text, text);

create or replace function public.admin_website_ids(
  p_search text default null,
  p_status text default null,
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

comment on function public.admin_website_ids(text, text, integer, integer) is
  'One window of the listing ids an admin filter matches, for the header checkbox that selects a whole filter rather than a page. Ids only, and the caller walks it to the end - PostgREST caps a single response and does not say so.';

/*
  Domains for a selection.

  "Copy domains" is a list to paste into somebody else's tool - Majestic's
  bulk checker, a crawler - and it needs the domain and nothing else. Reading
  it through the admin row select meant fetching metrics, services, niche
  prices, contacts and commercials, and pricing every one, for twelve thousand
  listings nobody was going to look at.
*/
create or replace function public.admin_website_domains(p_ids uuid[])
returns table (id uuid, domain text)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.domain
  from public.websites w
  where w.id = any(coalesce(p_ids, '{}'::uuid[]))
  order by w.updated_at desc, w.id asc;
$$;

comment on function public.admin_website_domains(uuid[]) is
  'The domains behind a selection of listing ids. Domains only - no costs, no contacts, nothing an admin row carries that a paste box has no business holding.';

revoke all on function public.admin_website_ids(text, text, integer, integer) from public;
revoke all on function public.admin_website_ids(text, text, integer, integer) from anon;
revoke all on function public.admin_website_ids(text, text, integer, integer) from authenticated;

revoke all on function public.admin_website_domains(uuid[]) from public;
revoke all on function public.admin_website_domains(uuid[]) from anon;
revoke all on function public.admin_website_domains(uuid[]) from authenticated;
