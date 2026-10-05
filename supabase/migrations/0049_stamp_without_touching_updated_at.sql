-- ---------------------------------------------------------------------------
-- 0049  A sweep's stamp is not an edit
--
-- `websites` has had a blanket `before update` trigger since 0001 that sets
-- `updated_at = now()` on any change at all. That was right when every update
-- to the table was somebody editing a listing.
--
-- 0048 made it wrong. The description sweep writes `description_checked_at` on
-- every listing it reads, and about sixty per cent of homepages yield nothing
-- usable - so for those, the only thing that changed is a bookkeeping stamp
-- saying "we looked". The trigger could not tell the difference and moved
-- `updated_at` anyway, which quietly reset the last-edited date on the whole
-- inventory the first time a sweep ran.
--
-- That date is not decorative. The admin website list is ordered by it, which
-- is how somebody finds what they changed this morning, and it is a column in
-- the CSV export. Once overwritten it cannot be recovered.
--
-- So the trigger now asks whether anything but the stamp changed. Filling in a
-- description still moves `updated_at`, because that genuinely is an edit to
-- the listing. Reading a homepage and finding nothing does not.
--
-- Safe to apply while a sweep is running: it protects every listing the sweep
-- has not reached yet, and needs no restart.
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
    The row either side, with the two bookkeeping columns removed.

    Compared as jsonb rather than column by column so that a column added to
    `websites` later is covered automatically. A comparison that had to be
    kept in step with the table would fall out of step, and the failure would
    be silent: a real edit that stopped moving `updated_at`.
  */
  v_old := to_jsonb(old) - 'updated_at' - 'description_checked_at';
  v_new := to_jsonb(new) - 'updated_at' - 'description_checked_at';

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

drop trigger if exists websites_set_updated_at on public.websites;

create trigger websites_set_updated_at
  before update on public.websites
  for each row execute function public.websites_set_updated_at();
