-- ---------------------------------------------------------------------------
-- 0067  The admin website table, one page at a time
--
-- `/admin/websites` takes about a minute to open. It reads every non-archived
-- listing - 11,042 of them - with `service_costs`, `website_contacts` and
-- `website_commercials` joined on, computes the true cost of every one, and
-- renders fifty rows.
--
-- 500 rows a page through `readAllPages` is twenty-three round trips in a row
-- before any of it is mapped, which is why no plan upgrade fixes it: a bigger
-- database does not make twenty-three sequential waits into fewer.
--
-- Two functions, both narrow. `admin_website_page` returns the ids for one
-- page and the total; `admin_website_ids` returns every id the filter matches
-- and nothing else.
--
-- The second exists because of a feature worth keeping. The table's header
-- checkbox selects everything the filter matches rather than the fifty rows
-- on screen - filtering to "draft" and ticking it is how a couple of hundred
-- listings get published in one go - and server-side paging would quietly
-- turn that into "this page only". Ids are cheap: eleven thousand uuids is
-- about four hundred kilobytes and only when somebody actually asks.
--
-- Searching matches the table's own rule: domain, title and niche, case
-- insensitive, substring. `position(... in ...)` rather than LIKE, because a
-- search term is input and `%` and `_` are wildcards in a LIKE pattern.
--
-- `security definer` with the revokes below: the admin signs in with a shared
-- password and carries no `auth.uid()`, so `is_admin()` is false for them and
-- row level security would hand them nothing. That is why every admin read
-- goes through the service role, and why these must be unreachable by anyone
-- else - the list of what we have not published yet is not public.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.admin_website_page(
  p_search text default null,
  p_status text default null,
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

comment on function public.admin_website_page(text, text, integer, integer) is
  'One page of the admin website table. Returns ids and the total; the caller maps the rows with the admin select it already has.';

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

comment on function public.admin_website_ids(text, text) is
  'Every listing id the admin filter matches, for the header checkbox that selects a whole filter rather than a page. Ids only - no domains, no metrics, nothing a page would render.';

revoke all on function public.admin_website_page(text, text, integer, integer) from public;
revoke all on function public.admin_website_page(text, text, integer, integer) from anon;
revoke all on function public.admin_website_page(text, text, integer, integer) from authenticated;

revoke all on function public.admin_website_ids(text, text) from public;
revoke all on function public.admin_website_ids(text, text) from anon;
revoke all on function public.admin_website_ids(text, text) from authenticated;
