-- ---------------------------------------------------------------------------
-- 0037  Reordering a page's sections, in one statement
--
-- Dragging a section from fifth to second renumbers most of the page. Doing
-- that a row at a time collides: the row moving to position 2 lands on a
-- number the old second row has not vacated yet, and the unique constraint
-- refuses it halfway through, leaving the page in an order nobody asked for.
--
-- 0036 made that constraint deferrable so the check happens at the end of the
-- statement rather than per row. This is the statement. One UPDATE, joined
-- against the new order, so every position changes at once and the page is
-- either fully reordered or untouched.
--
-- It could be done from the application as "move everything negative, then
-- move it back", which is two statements and a window where the page's order
-- is nonsense. This is one, and it puts the ownership check next to the write
-- rather than trusting the caller to have done it.
--
-- Re-runnable: replacing a function is what `or replace` is for.
-- ---------------------------------------------------------------------------

create or replace function public.reorder_page_sections(page text, ordered uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  -- Only an administrator reorders a page. Security definer means this runs
  -- as the owner, so without this check it would be a way for anyone to
  -- rearrange a live marketing page.
  if not public.is_admin() then
    raise exception 'Only an admin can reorder page sections';
  end if;

  -- Every id has to belong to the page being reordered. Otherwise a crafted
  -- call could pull a section off another page by naming its id here - the
  -- update would set its position without ever touching its page_slug, and it
  -- would appear in two orders at once.
  if exists (
    select 1
    from unnest(ordered) as wanted(id)
    left join public.page_sections section on section.id = wanted.id
    where section.id is null or section.page_slug <> page
  ) then
    raise exception 'Every section must belong to the page being reordered';
  end if;

  -- The whole page, renumbered from the array's order, in one statement.
  update public.page_sections
  set position = new_order.position - 1
  from (select id, ordinality as position from unnest(ordered) with ordinality as t(id, ordinality)) as new_order
  where public.page_sections.id = new_order.id;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.reorder_page_sections(text, uuid[]) is
  'Renumber a page''s sections from the given order, in one statement so the deferrable unique constraint is checked once.';

revoke all on function public.reorder_page_sections(text, uuid[]) from public;
grant execute on function public.reorder_page_sections(text, uuid[]) to authenticated, service_role;
