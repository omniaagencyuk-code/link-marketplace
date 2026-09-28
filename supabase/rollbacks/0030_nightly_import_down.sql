-- Undo 0030. Removing the schedule's settings stops it running; nothing it
-- previously imported is affected, those are ordinary emails now.

alter table public.sourcing_settings drop column if exists nightly_import_last_result;
alter table public.sourcing_settings drop column if exists nightly_import_last_run_at;
alter table public.sourcing_settings drop column if exists nightly_import_reads;
alter table public.sourcing_settings drop column if exists nightly_import_cap;
alter table public.sourcing_settings drop column if exists nightly_import_query;
alter table public.sourcing_settings drop column if exists nightly_import_enabled;
