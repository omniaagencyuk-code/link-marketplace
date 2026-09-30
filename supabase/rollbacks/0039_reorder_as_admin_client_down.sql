-- Put 0037's version back: security definer, with its own is_admin() check.
--
-- Worth knowing before running this: that version refuses the service-role
-- client, which is the only client the admin area has. Rolling back restores
-- the bug - every reorder silently does nothing again.
create or replace function public.reorder_page_sections(page text, ordered uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can reorder page sections';
  end if;

  if exists (
    select 1
    from unnest(ordered) as wanted(id)
    left join public.page_sections section on section.id = wanted.id
    where section.id is null or section.page_slug <> page
  ) then
    raise exception 'Every section must belong to the page being reordered';
  end if;

  update public.page_sections
  set position = new_order.position - 1
  from (select id, ordinality as position from unnest(ordered) with ordinality as t(id, ordinality)) as new_order
  where public.page_sections.id = new_order.id;

  get diagnostics moved = row_count;
  return moved;
end;
$$;
