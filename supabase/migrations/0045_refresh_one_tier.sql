-- ---------------------------------------------------------------------------
-- 0045  Refresh one tier at a time
--
-- A run takes whatever is due, in tier order. That is right for the nightly
-- job and wrong for a person standing at the screen deciding how to spend the
-- month's credits: with five hundred tier 3 domains overdue and a handful of
-- tier 1, "Run now" is an all-or-nothing button costing tens of thousands of
-- units, and the only way to refresh a cheap slice was to wait for the
-- schedule.
--
-- So the selection takes an optional tier. Null is every tier, which is what
-- the nightly job passes and what the old signature did, so nothing about the
-- schedule changes.
--
-- The old one-argument function stays. PostgREST resolves an RPC by the
-- arguments it is given, so a deploy that still calls `ahrefs_due_domains(
-- p_limit)` keeps working while the new column of the application rolls out -
-- which matters because the database is migrated before the code that uses it.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.ahrefs_due_domains(p_limit integer, p_tier smallint)
returns table (id uuid, domain text, tier smallint)
language sql
volatile
security definer
set search_path = public
as $$
  with settings as (select * from public.refresh_settings where id)
  select w.id, w.domain, coalesce(w.ahrefs_tier, 3)::smallint as tier
  from public.websites w
  cross join settings s
  where w.status <> 'archived'
    -- Null means every tier, so one function serves the nightly job and a
    -- person picking a tier off the screen.
    and (p_tier is null or coalesce(w.ahrefs_tier, 3) = p_tier)
    and (
      w.last_ahrefs_refresh_at is null
      or w.last_ahrefs_refresh_at < timezone('utc', now()) - make_interval(
        days => case coalesce(w.ahrefs_tier, 3)
          when 1 then s.tier1_interval_days
          when 2 then s.tier2_interval_days
          else s.tier3_interval_days
        end
      )
    )
  order by coalesce(w.ahrefs_tier, 3), w.last_ahrefs_refresh_at nulls first, w.id
  limit greatest(0, p_limit);
$$;

revoke all on function public.ahrefs_due_domains(integer, smallint) from public;
