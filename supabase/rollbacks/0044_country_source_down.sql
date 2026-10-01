-- ---------------------------------------------------------------------------
-- Undo 0044.
--
-- DESTROYS: the record of where each country came from. The countries
-- themselves survive - this only drops the column saying how each was arrived
-- at - but once it is gone, the nightly Ahrefs refresh can no longer tell a
-- country a person chose from one it worked out itself, and the application
-- treats a country with no source as overwritable.
--
-- Run 0044 again to rebuild the column. The backfill reconstructs 'measured'
-- and 'domain' from the same evidence, but anything that was 'stated' comes
-- back only because 'stated' is what an unexplainable country falls back to.
-- ---------------------------------------------------------------------------

alter table public.websites drop constraint if exists websites_country_needs_a_source;
alter table public.websites drop constraint if exists websites_country_source_check;
alter table public.websites drop column if exists country_source;
