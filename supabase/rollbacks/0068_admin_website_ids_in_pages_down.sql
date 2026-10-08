-- ---------------------------------------------------------------------------
-- Undo 0068.
--
-- DESTROYS: nothing. Two functions that only read.
--
-- It restores 0067's two-argument `admin_website_ids`, because the admin table
-- fails outright against a missing function and that is the safer failure.
--
-- What comes back with it is the bug: a single call, capped by PostgREST at a
-- thousand rows with nothing in the response saying so, so the header checkbox
-- reports "1000 selected" against an inventory of 12,246 and a bulk action
-- then runs on the first thousand. Only run this alongside 0067-era code, and
-- know that version of the checkbox is wrong above a thousand listings.
--
-- `admin_website_domains` is dropped with it. Copy domains falls back to the
-- admin row read, which fetches costs, contacts and commercials and prices
-- every listing to use one column.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_website_domains(uuid[]);
drop function if exists public.admin_website_ids(text, text, integer, integer);

create or replace function public.admin_website_ids(
  p_search text default null,
  p_status text default null
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
  order by w.updated_at desc, w.id asc;
$$;

revoke all on function public.admin_website_ids(text, text) from public;
revoke all on function public.admin_website_ids(text, text) from anon;
revoke all on function public.admin_website_ids(text, text) from authenticated;
