-- ---------------------------------------------------------------------------
-- 0051  The Ahrefs stamp is bookkeeping too
--
-- 0049 taught the `updated_at` trigger to ignore `description_checked_at`,
-- because a sweep recording that it looked at a homepage is not somebody
-- editing a listing. `last_ahrefs_refresh_at` is the same kind of column and
-- was missed.
--
-- It matters now because backfilling a newly added metric means clearing that
-- stamp across the inventory so every domain comes due again - and measured
-- against the trigger as it stood, that single statement moved `updated_at` on
-- every row it touched. One backfill would have undone exactly what 0049 was
-- written to protect, and the real edit dates cannot be recovered afterwards.
--
-- ## What still counts as an edit
--
-- A refresh that changes a figure. If Ahrefs returns a new domain rating, new
-- traffic or a new keyword count, the listing's published data really did
-- change and `updated_at` moves. Only a run that finds everything identical -
-- or a backfill that touches nothing but the stamp - leaves the date alone.
--
-- That is a small improvement on the nightly job as well: a listing whose
-- metrics did not move no longer claims to have been updated.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.websites_set_updated_at()
returns trigger
language plpgsql
as $$
declare
  v_old jsonb;
  v_new jsonb;
begin
  /*
    The row either side, with the bookkeeping columns removed.

    Compared as jsonb rather than column by column so that a column added to
    `websites` later is covered automatically. A comparison that had to be kept
    in step with the table would fall out of step, and the failure would be
    silent: a real edit that stopped moving `updated_at`.
  */
  v_old := to_jsonb(old) - 'updated_at' - 'description_checked_at' - 'last_ahrefs_refresh_at';
  v_new := to_jsonb(new) - 'updated_at' - 'description_checked_at' - 'last_ahrefs_refresh_at';

  if v_old = v_new then
    -- Nothing about the listing changed. Leave the date where it was, rather
    -- than claiming somebody edited it.
    new.updated_at = old.updated_at;
    return new;
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
