-- ---------------------------------------------------------------------------
-- Undo 0051.
--
-- DESTROYS: nothing. It returns the trigger to the 0049 version, which ignores
-- `description_checked_at` but not `last_ahrefs_refresh_at`.
--
-- After this, any statement that clears or sets the Ahrefs stamp moves
-- `updated_at` on every row it touches - so do not run a metric backfill
-- (`set last_ahrefs_refresh_at = null` across the inventory) with the trigger
-- in this state. One such statement resets the last-edited date on the whole
-- marketplace and the real dates cannot be recovered.
-- ---------------------------------------------------------------------------

create or replace function public.websites_set_updated_at()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  v_old := to_jsonb(old) - 'updated_at' - 'description_checked_at';
  v_new := to_jsonb(new) - 'updated_at' - 'description_checked_at';

  if v_old = v_new then
    new.updated_at = old.updated_at;
    return new;
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
