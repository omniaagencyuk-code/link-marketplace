-- ============================================================================
-- 0027  Importing publisher replies straight from Gmail
-- ============================================================================
-- The Takeout route works and is not going anywhere: export, split in the
-- browser, upload, extract. It is just slow, and slow enough that the backlog
-- does not get done.
--
-- This adds a second way in. A service account with domain-wide delegation
-- reads the mailboxes we send outreach from, and the threads it finds join the
-- pipeline at exactly the point an uploaded message joins it: a row in
-- `inbound_emails`, status 'new', waiting to be read. Nothing downstream of
-- that changes, and nothing here reaches a listing without a human pressing
-- Approve.
--
-- Three new tables and some columns:
--
--   gmail_mailboxes     which addresses may be impersonated, and nothing else
--                       may be. The allowlist is the security boundary, so it
--                       lives in the database and is checked server side on
--                       every call.
--   gmail_import_jobs   one row per run, with its counts and its query.
--   gmail_import_items  one row per thread, so a run of 200 threads can stop
--                       half way and pick up where it left off.
--
-- All three are admin-only: no customer-facing policy exists for any of them,
-- deliberately, in the same way as `inbound_emails` and `listing_drafts`.
--
-- Reversible: supabase/rollbacks/0027_gmail_import_down.sql
-- ============================================================================

-- ------------------------------------------------------- who may be read --
-- An address not in this table is never impersonated, however the request
-- asks. A service account with domain-wide delegation can open any mailbox in
-- the workspace, so "which mailboxes" is not a UI preference - it is the only
-- thing standing between this feature and everyone's private mail.

create table if not exists public.gmail_mailboxes (
  address text primary key,
  label text,
  enabled boolean not null default true,
  added_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint gmail_mailboxes_address_shape check (address ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.gmail_mailboxes is
  'Mailboxes the service account may impersonate. Admin only - the allowlist is the security boundary for domain-wide delegation.';

alter table public.gmail_mailboxes enable row level security;

do $$
begin
  create policy "Admins manage gmail mailboxes"
    on public.gmail_mailboxes for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger gmail_mailboxes_set_updated_at
    before update on public.gmail_mailboxes
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------------- the runs --

create table if not exists public.gmail_import_jobs (
  id uuid primary key default gen_random_uuid(),

  mailboxes text[] not null default '{}',
  query text not null default '',
  label_filter text,
  max_threads integer not null default 200 check (max_threads > 0),

  -- 'listing' walks the search results; 'fetching' pulls the bodies. Two
  -- phases rather than one because listing is cheap and fast and fetching is
  -- neither, and a job that dies mid-fetch must not re-list.
  status text not null default 'listing'
    check (status in ('listing', 'fetching', 'done', 'failed', 'cancelled')),
  status_reason text,

  threads_found integer not null default 0,
  threads_fetched integer not null default 0,
  threads_skipped integer not null default 0,
  threads_failed integer not null default 0,
  emails_created integer not null default 0,

  -- Set while a chunk is in flight, cleared when it finishes. A job whose
  -- lease has expired is free for the cron to pick up: the alternative is a
  -- run stranded forever because a browser tab closed.
  leased_until timestamptz,

  started_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

comment on table public.gmail_import_jobs is
  'One Gmail import run. Admin only - contains search queries and mailbox names.';

create index if not exists gmail_import_jobs_status_idx
  on public.gmail_import_jobs (status, created_at desc);

alter table public.gmail_import_jobs enable row level security;

do $$
begin
  create policy "Admins manage gmail import jobs"
    on public.gmail_import_jobs for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger gmail_import_jobs_set_updated_at
    before update on public.gmail_import_jobs
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ----------------------------------------------------------- the threads --
-- The unit of work and the unit of resumption. A thread is listed first and
-- fetched later, so a job that stops half way has an exact record of what it
-- had already done.

create table if not exists public.gmail_import_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.gmail_import_jobs (id) on delete cascade,

  mailbox text not null,
  gmail_thread_id text not null,

  -- Gmail bumps this when a thread changes. A thread we have already imported
  -- is only worth fetching again when this has moved, which is what makes a
  -- re-run of the same query cost almost nothing.
  history_id text,

  status text not null default 'pending'
    check (status in ('pending', 'fetched', 'skipped', 'failed')),
  status_reason text,
  attempts smallint not null default 0,

  -- The email this thread became, when it became one.
  email_id uuid references public.inbound_emails (id) on delete set null,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- One row per thread per mailbox, across every job. A second run of the
  -- same query finds the thread already recorded rather than importing it
  -- twice - which is also why this is not keyed on the job.
  unique (mailbox, gmail_thread_id)
);

comment on table public.gmail_import_items is
  'One Gmail thread seen by an import. Admin only. Unique per mailbox and thread, so a re-run cannot import the same thread twice.';

create index if not exists gmail_import_items_job_idx
  on public.gmail_import_items (job_id, status);

alter table public.gmail_import_items enable row level security;

do $$
begin
  create policy "Admins manage gmail import items"
    on public.gmail_import_items for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger gmail_import_items_set_updated_at
    before update on public.gmail_import_items
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------------- where an email came from --
-- The upload route stays exactly as it is. These columns are null for
-- everything it produces, which is what `source` defaulting to 'upload' says.

alter table public.inbound_emails
  add column if not exists source text not null default 'upload'
    check (source in ('upload', 'pasted', 'gmail'));

alter table public.inbound_emails
  add column if not exists mailbox text;

alter table public.inbound_emails
  add column if not exists gmail_thread_id text;

-- Every Message-ID in the thread, not just the one this row is keyed on.
--
-- A thread becomes one row, but the same messages may already be here as
-- individual rows from a Takeout upload. Recording the whole set is what lets
-- the importer notice that and skip the thread, instead of paying to read
-- mail we have already read.
alter table public.inbound_emails
  add column if not exists message_ids text[] not null default '{}';

-- Filename, MIME type and size. Never the attachment itself: a rate card is
-- worth knowing about, and not worth storing megabytes of.
alter table public.inbound_emails
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- A PDF, spreadsheet or CSV on the thread usually is the rate card, and the
-- reply that carries one often says little on its own.
alter table public.inbound_emails
  add column if not exists has_rate_card boolean not null default false;

comment on column public.inbound_emails.message_ids is
  'Every Message-ID in the source thread. Used to detect mail already imported from a Takeout upload.';

create index if not exists inbound_emails_thread_idx
  on public.inbound_emails (mailbox, gmail_thread_id);

-- A Message-ID appears in exactly one row, whichever route brought it in.
create index if not exists inbound_emails_message_ids_idx
  on public.inbound_emails using gin (message_ids);

-- ------------------------------------------------------------- purging --
-- Off by default. Deleting bodies is irreversible and the emails are the only
-- record of what a publisher agreed to, so switching this on is a decision
-- somebody makes deliberately rather than one they inherit.

alter table public.sourcing_settings
  add column if not exists purge_bodies_enabled boolean not null default false;

alter table public.sourcing_settings
  add column if not exists purge_bodies_after_days smallint not null default 90
    check (purge_bodies_after_days >= 7);

comment on column public.sourcing_settings.purge_bodies_enabled is
  'Off by default. When on, bodies of reviewed emails are cleared after purge_bodies_after_days.';
