-- ============================================================================
-- 0030  A nightly Gmail import
-- ============================================================================
-- The campaign is still sending, so replies keep arriving. Importing them
-- means remembering to, and the whole point of the Gmail route was to stop
-- the backlog depending on somebody remembering.
--
-- Importing costs nothing - the Gmail API is free and a thread already
-- imported is skipped - so the schedule is safe to leave on. Reading costs
-- money, so that is a separate switch and it is off: a broad query left
-- running overnight would spend the month's budget while nobody was looking.
-- With it on, the monthly budget still applies, because every run checks it
-- before submitting.
--
-- The mailboxes are not configured here. The schedule reads whichever are
-- enabled in the allowlist, so adding one includes it in tonight's run
-- without a second place to remember.
--
-- Reversible: supabase/rollbacks/0030_nightly_import_down.sql
-- ============================================================================

alter table public.sourcing_settings
  add column if not exists nightly_import_enabled boolean not null default false;

alter table public.sourcing_settings
  add column if not exists nightly_import_query text not null
    default '-from:me newer_than:14d (price OR rates OR "guest post" OR sponsored OR advertising)';

alter table public.sourcing_settings
  add column if not exists nightly_import_cap integer not null default 200
    check (nightly_import_cap > 0 and nightly_import_cap <= 2000);

-- Off. Importing is free; reading is not, and a schedule that spends money
-- unattended is a decision somebody makes rather than one they inherit.
alter table public.sourcing_settings
  add column if not exists nightly_import_reads boolean not null default false;

alter table public.sourcing_settings
  add column if not exists nightly_import_last_run_at timestamptz;

alter table public.sourcing_settings
  add column if not exists nightly_import_last_result text;

comment on column public.sourcing_settings.nightly_import_reads is
  'Off by default. When on, the nightly import also sends what it found to the model, within the monthly budget.';

comment on column public.sourcing_settings.nightly_import_last_result is
  'What the last scheduled run did, in words, so a schedule that quietly stopped working is visible without reading logs.';
