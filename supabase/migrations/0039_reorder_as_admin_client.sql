-- ---------------------------------------------------------------------------
-- 0039  Reordering a page, from the client that actually does the reordering
--
-- 0037 added `reorder_page_sections` with its own check: refuse unless
-- `is_admin()`. That check was wrong for the only caller there has ever been.
--
-- `is_admin()` is `auth.uid()` matched against an admin profile. The admin
-- area signs in with a shared password rather than through Supabase Auth, so
-- its requests carry no `auth.uid()` at all - which is the whole reason every
-- admin write goes through the service-role client. The service role bypasses
-- row level security, so every other write worked; this function is the one
-- place with a second, hand-written copy of "who is an admin", and that copy
-- said no to the only client that calls it.
--
-- So every reorder has failed since it shipped. The arrows did nothing, drag
-- and drop did nothing, duplicating a section put the copy at the bottom of
-- the page instead of under the original, and inserting one between two
-- others appended it - all of them silently, because the application called
-- the action and never looked at what came back.
--
-- The fix is to delete the second copy of the rule rather than to correct it.
-- `security invoker` means the UPDATE runs as whoever called, so the policies
-- on `page_sections` decide - the same policies that already decide every
-- other write to that table:
--
--   * the service role bypasses them, and the admin area is the service role
--   * a signed-in admin passes them through `is_admin()`
--   * anyone else is refused by the database, in one place, for every path
--
-- What the function still does is the part a policy cannot express: renumber
-- the whole page in one statement, so the deferrable unique constraint is
-- checked once when the new order is complete, and refuse ids belonging to
-- another page.
--
-- Re-runnable: replacing a function is what `or replace` is for.
-- ---------------------------------------------------------------------------

create or replace function public.reorder_page_sections(page text, ordered uuid[])
returns integer
language plpgsql
-- Invoker, not definer. See above: the definer version carried its own idea
-- of who an administrator is, and it was wrong for the admin area.
security invoker
set search_path = public
as $$
declare
  moved integer;
begin
  -- Every id has to belong to the page being reordered. Otherwise a crafted
  -- call could pull a section off another page by naming its id here - the
  -- update would set its position without ever touching its page_slug, and it
  -- would appear in two orders at once.
  --
  -- Read as the caller, so a stranger - who can see no hidden row and no
  -- draft page's rows - fails this before reaching the update.
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

  -- How many rows actually moved. Zero means the policies refused them, which
  -- the application reports rather than swallowing: a reorder that quietly
  -- does nothing is exactly the bug this migration exists to fix.
  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.reorder_page_sections(text, uuid[]) is
  'Renumber a page''s sections from the given order, in one statement so the deferrable unique constraint is checked once. Runs as the caller: the table''s own policies decide who may.';

revoke all on function public.reorder_page_sections(text, uuid[]) from public;
grant execute on function public.reorder_page_sections(text, uuid[]) to authenticated, service_role;
