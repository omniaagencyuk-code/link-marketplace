-- ---------------------------------------------------------------------------
-- Undo 0049.
--
-- DESTROYS: nothing. It puts the blanket `updated_at` trigger back, exactly as
-- 0001 wrote it.
--
-- Only run this alongside code that does not run a description sweep. With
-- 0048's sweep in place, the blanket trigger resets the last-edited date on
-- every listing the sweep reads - including the roughly sixty per cent where
-- nothing is found and the only thing written is a stamp saying "we looked".
-- That is the bug 0049 exists to fix, and those dates cannot be recovered
-- once overwritten.
-- ---------------------------------------------------------------------------

drop trigger if exists websites_set_updated_at on public.websites;

create trigger websites_set_updated_at
  before update on public.websites
  for each row execute function public.set_updated_at();

drop function if exists public.websites_set_updated_at();
