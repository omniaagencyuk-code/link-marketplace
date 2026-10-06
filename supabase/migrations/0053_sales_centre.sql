-- ---------------------------------------------------------------------------
-- 0053  The Sales Centre
--
-- Everything so far points outwards at publishers: who will sell us a
-- placement, for how much. This is the other direction - who will buy one -
-- and it is a different kind of data with a different kind of risk.
--
-- Three rules shape every table below.
--
-- 1. It is all internal. A prospect is a company we have decided to approach,
--    a qualification is a judgement about them, a contact is a named person's
--    work address. None of it has a customer-facing policy, deliberately, in
--    the same way `service_costs` and `website_contacts` have none. Row level
--    security cannot hide a column, so nothing here goes near `websites`.
--
-- 2. Nothing is sent without a human. The parallel is `draft_approval`: the
--    model proposes, a person approves, and approval is the only path. Here
--    that is enforced by the database rather than only by the code, because
--    the thing being prevented is an email to a real company in our name.
--
-- 3. An unsubscribe is absolute. `sales_suppressions` is checked by a trigger
--    on the way to the wire, not by the caller, because a suppression that
--    depends on every future caller remembering it is not a suppression. A
--    send to somebody who asked us to stop is the one failure here that cannot
--    be undone by correcting a row.
--
-- Spend is measured, never estimated: Hunter credits come from what Hunter
-- charged, model cost from the tokens the API reported. That is the same rule
-- the Ahrefs refresh learned the hard way in 0014.
--
-- Written to survive being run twice. No statement contains a comment.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------ types --

do $$
begin
  create type public.sales_segment as enum (
    'seo_agency',
    'digital_pr',
    'link_building',
    'affiliate_igaming',
    'affiliate_sports',
    'affiliate_finance',
    'affiliate_other',
    'ecommerce',
    'saas',
    'publisher_network',
    'other'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.prospect_stage as enum (
    'new',
    'researching',
    'qualified',
    'disqualified',
    'contacted',
    'replied',
    'in_conversation',
    'won',
    'lost',
    'unsubscribed'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.outbound_status as enum (
    'draft',
    'needs_review',
    'approved',
    'scheduled',
    'sent',
    'failed',
    'bounced',
    'cancelled'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.reply_classification as enum (
    'interested',
    'question',
    'not_now',
    'not_interested',
    'unsubscribe',
    'out_of_office',
    'bounce',
    'other'
  );
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------------------------------- settings --
--
-- One row, pinned, in the same shape as `refresh_settings`: the thing that
-- governs a job belongs beside the job and not in an environment variable, so
-- a cap can be changed without a redeploy.
--
-- It ships OFF, in dry run, with a Hunter budget of zero. Zero is not a
-- mistake - a credit budget nobody has set is a credit budget nobody has
-- agreed to spend, and refusing is the safe reading.

create table if not exists public.sales_settings (
  id boolean primary key default true check (id),

  enabled boolean not null default false,
  dry_run boolean not null default true,

  model text not null default 'claude-opus-5',
  monthly_ai_budget_usd numeric(10, 2) not null default 50.00
    check (monthly_ai_budget_usd >= 0),

  hunter_monthly_credit_budget integer not null default 0
    check (hunter_monthly_credit_budget >= 0),
  hunter_credit_safety_pct smallint not null default 90
    check (hunter_credit_safety_pct between 1 and 100),
  hunter_cycle_day smallint not null default 1 check (hunter_cycle_day between 1 and 28),

  daily_send_cap smallint not null default 40 check (daily_send_cap >= 0),
  per_domain_open_cap smallint not null default 1 check (per_domain_open_cap > 0),

  max_follow_ups smallint not null default 2 check (max_follow_ups between 0 and 5),
  follow_up_gap_days smallint not null default 4 check (follow_up_gap_days > 0),

  send_from text,
  send_reply_to text,

  crawl_max_pages smallint not null default 6 check (crawl_max_pages between 1 and 20),
  min_score_to_contact smallint not null default 50 check (min_score_to_contact between 0 and 100),

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.sales_settings (id) values (true) on conflict (id) do nothing;

comment on table public.sales_settings is
  'Governs the outbound sales job. Admin only. Ships off, in dry run, with a Hunter budget of zero.';
comment on column public.sales_settings.hunter_monthly_credit_budget is
  'Zero refuses every lookup. A budget nobody set is a budget nobody agreed to spend.';

-- -------------------------------------------------------------- prospects --
--
-- A company we might sell to. The domain is the identity - normalised the way
-- the CSV importer normalises a publisher domain - because one company
-- reached twice from two spellings of its own website is the mistake that
-- makes outbound look like spam.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),

  -- Used in a link anybody might receive, so it is random rather than
  -- sequential and the internal id never leaves the building.
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),

  company_name text not null,
  domain text not null unique,
  website_url text,

  segment public.sales_segment not null default 'other',
  stage public.prospect_stage not null default 'new',

  country_code char(2),

  source text not null default 'manual'
    check (source in ('manual', 'csv', 'crawl', 'referral', 'inbound')),
  source_detail text,

  research_status text not null default 'pending'
    check (research_status in ('pending', 'running', 'done', 'failed', 'skipped')),
  researched_at timestamptz,
  research_error text,

  -- What the crawl established without asking a model: pages found, words
  -- that appeared, whether there is a services page at all. Kept apart from
  -- the model's reading so a prompt change cannot rewrite the evidence.
  signals jsonb not null default '{}'::jsonb,

  qualified boolean,
  qualified_at timestamptz,
  disqualified_reason text,

  score smallint check (score is null or score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  scored_at timestamptz,

  contacts_status text not null default 'pending'
    check (contacts_status in ('pending', 'running', 'found', 'none', 'failed', 'skipped')),
  contacts_checked_at timestamptz,

  owner text,
  notes text,

  last_contacted_at timestamptz,
  last_reply_at timestamptz,

  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.prospects is
  'Companies we might sell links to. Internal only - no customer-facing policy exists, deliberately.';

create index if not exists prospects_stage_idx on public.prospects (stage, updated_at desc);
create index if not exists prospects_segment_idx on public.prospects (segment);
create index if not exists prospects_score_idx on public.prospects (score desc nulls last);
create index if not exists prospects_research_queue_idx
  on public.prospects (research_status, created_at)
  where research_status = 'pending';
create index if not exists prospects_contacts_queue_idx
  on public.prospects (contacts_status, score desc nulls last)
  where contacts_status = 'pending';

-- --------------------------------------------------------- crawled pages --
--
-- What their own site says, in its own words, bounded. The excerpt is plain
-- text with the markup removed before it is stored: the only consumer is a
-- prompt and a human reading a panel, and neither wants HTML. Storing it
-- stripped also means there is no path by which a crawled `<script>` reaches
-- a page we render.

create table if not exists public.prospect_pages (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,

  url text not null,
  kind text not null default 'other'
    check (kind in ('home', 'about', 'services', 'pricing', 'clients', 'blog', 'contact', 'other')),

  http_status smallint,
  title text,
  text_excerpt text not null default '',
  bytes integer,

  error text,
  fetched_at timestamptz not null default timezone('utc', now()),

  unique (prospect_id, url)
);

create index if not exists prospect_pages_prospect_idx on public.prospect_pages (prospect_id);

comment on column public.prospect_pages.text_excerpt is
  'Plain text, markup already removed. Nothing stored here is ever rendered as HTML.';

-- ------------------------------------------------------- qualifications --
--
-- The model's reading, kept as history rather than overwritten. A rule that
-- turns out to be wrong has to be findable: every row records the model and
-- the prompt version it was produced under, the same bookkeeping
-- `listing_drafts` keeps for publisher extraction.

create table if not exists public.prospect_qualifications (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,

  verdict text not null check (verdict in ('likely_buyer', 'unlikely', 'unclear')),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  segment_guess public.sales_segment,

  -- Each reason carries the sentence it was read from. A claim with no quote
  -- behind it is the model writing sales copy about a company it invented.
  reasons jsonb not null default '[]'::jsonb,
  buying_signals jsonb not null default '[]'::jsonb,

  model text not null,
  prompt_version text not null,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 4),

  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists prospect_qualifications_prospect_idx
  on public.prospect_qualifications (prospect_id, created_at desc);

-- ---------------------------------------------------------------- contacts --
--
-- A named person at a prospect. `selected` is the one we would write to, and
-- only one per prospect can hold it - picking a recipient is a decision, and
-- two of them is how the same company gets two different emails from us on
-- the same morning.

create table if not exists public.prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,

  email text not null check (position('@' in email) > 1),
  full_name text,
  first_name text,
  last_name text,
  role text,
  seniority text,
  department text,
  linkedin_url text,

  -- Hunter's own score for the address, 0-100. Null means nobody has scored
  -- it, which is not the same as a low score.
  email_confidence smallint check (email_confidence is null or email_confidence between 0 and 100),
  verification text not null default 'unverified'
    check (verification in ('unverified', 'valid', 'accept_all', 'invalid', 'unknown')),

  source text not null default 'manual' check (source in ('hunter', 'manual', 'crawl')),
  hunter_payload jsonb,

  selected boolean not null default false,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (prospect_id, email)
);

create unique index if not exists prospect_contacts_one_selected_idx
  on public.prospect_contacts (prospect_id)
  where selected;

create index if not exists prospect_contacts_prospect_idx on public.prospect_contacts (prospect_id);

comment on table public.prospect_contacts is
  'Named people at prospect companies. Personal data - admin only, and never joined to anything customer-facing.';

-- ----------------------------------------------------------- hunter ledger --
--
-- Every call, with what it charged. The budget is answered from this rather
-- than from an estimate, for the reason 0014 wrote down: a cost model that is
-- not read back from the provider is fiction the moment the request changes.
--
-- The live account reading is kept beside the call that took it, so the
-- figure survives Hunter being unreachable later.

create table if not exists public.hunter_lookups (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete set null,

  endpoint text not null
    check (endpoint in ('domain-search', 'email-finder', 'email-verifier', 'account')),
  query text,

  credits_charged integer not null default 0 check (credits_charged >= 0),
  results_count smallint,

  http_status smallint,
  error text,

  account_requests_used integer,
  account_requests_available integer,

  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists hunter_lookups_created_idx on public.hunter_lookups (created_at desc);

comment on table public.hunter_lookups is
  'One row per Hunter API call. The credit budget is summed from here - never estimated.';

-- --------------------------------------------------------------- campaigns --

create table if not exists public.sales_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'done', 'cancelled')),

  segment public.sales_segment,
  min_score smallint check (min_score is null or min_score between 0 and 100),

  -- The pitch, in our words. It is guidance for the generator, not the email:
  -- the email is written per prospect from their own site and our inventory.
  angle text not null default '',

  daily_cap smallint check (daily_cap is null or daily_cap >= 0),
  from_address text,
  reply_to text,

  created_by text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists sales_campaigns_status_idx on public.sales_campaigns (status, created_at desc);

create table if not exists public.campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.sales_campaigns (id) on delete cascade,

  step_number smallint not null check (step_number between 1 and 6),
  delay_days smallint not null default 4 check (delay_days >= 0),
  purpose text not null default '',
  guidance text not null default '',

  created_at timestamptz not null default timezone('utc', now()),

  unique (campaign_id, step_number)
);

-- --------------------------------------------------------- outbound emails --
--
-- A draft, then an approval, then a send. The status column is the whole
-- lifecycle and the trigger below is what makes the order real: nothing
-- reaches 'scheduled' or 'sent' without a named approver, and nothing reaches
-- either if the address is suppressed.

create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  contact_id uuid references public.prospect_contacts (id) on delete set null,
  campaign_id uuid references public.sales_campaigns (id) on delete set null,

  step_number smallint not null default 1 check (step_number between 1 and 6),

  to_address text not null check (position('@' in to_address) > 1),
  subject text not null,
  body_text text not null,
  body_html text,

  status public.outbound_status not null default 'draft',
  status_reason text,

  -- The listings this email cites, by id, so a claim about our inventory can
  -- be checked against the inventory rather than taken on trust.
  matched_inventory jsonb not null default '[]'::jsonb,

  model text,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 4),

  edited boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  approved_by text,
  approved_at timestamptz,

  scheduled_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  error text,

  -- Makes a retry safe at the provider, the same way the reminder emails do.
  idempotency_key text unique,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (prospect_id, campaign_id, step_number)
);

create index if not exists outbound_emails_status_idx on public.outbound_emails (status, scheduled_at);
create index if not exists outbound_emails_prospect_idx on public.outbound_emails (prospect_id, created_at desc);
create index if not exists outbound_emails_sent_idx on public.outbound_emails (sent_at desc) where sent_at is not null;

-- ------------------------------------------------------------ suppressions --
--
-- The do-not-contact list, by address or by whole company. Checked by the
-- trigger below rather than by whoever is sending, because the guarantee has
-- to hold for the caller nobody has written yet.

create table if not exists public.sales_suppressions (
  id uuid primary key default gen_random_uuid(),

  email text,
  domain text,

  reason text not null
    check (reason in ('unsubscribed', 'bounced', 'complained', 'manual', 'do_not_contact')),
  note text,

  created_by text,
  created_at timestamptz not null default timezone('utc', now()),

  check (email is not null or domain is not null)
);

create unique index if not exists sales_suppressions_email_idx
  on public.sales_suppressions (lower(email)) where email is not null;
create unique index if not exists sales_suppressions_domain_idx
  on public.sales_suppressions (lower(domain)) where domain is not null;

comment on table public.sales_suppressions is
  'Do-not-contact, by address or by company domain. Enforced by a trigger on outbound_emails.';

-- ----------------------------------------------------------------- replies --

create table if not exists public.sales_replies (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete cascade,
  outbound_email_id uuid references public.outbound_emails (id) on delete set null,
  contact_id uuid references public.prospect_contacts (id) on delete set null,

  message_id text not null unique,
  from_address text not null,
  subject text,
  body_text text not null default '',
  received_at timestamptz,

  classification public.reply_classification,
  classified_by text check (classified_by is null or classified_by in ('ai', 'human')),
  confidence smallint check (confidence is null or confidence between 0 and 100),

  handled boolean not null default false,
  handled_by text,
  handled_at timestamptz,

  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists sales_replies_unhandled_idx
  on public.sales_replies (handled, received_at desc) where not handled;

-- ------------------------------------------------------------------ events --
--
-- The timeline. Everything that happened to a prospect in one place, because
-- "why did this company get three emails" is a question somebody will ask and
-- reconstructing the answer from five tables is how it goes unanswered.

create table if not exists public.prospect_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,

  kind text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  actor text,

  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists prospect_events_prospect_idx
  on public.prospect_events (prospect_id, created_at desc);

-- ------------------------------------------------------------- attribution --
--
-- Which prospect became which customer. Matched on the address they signed up
-- with or the domain of it, recorded rather than recomputed, so a later change
-- to the matching rule cannot quietly rewrite last quarter's numbers.

create table if not exists public.prospect_attributions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,

  matched_by text not null check (matched_by in ('email', 'domain', 'token', 'manual')),
  matched_at timestamptz not null default timezone('utc', now()),

  unique (prospect_id, profile_id)
);

create index if not exists prospect_attributions_profile_idx
  on public.prospect_attributions (profile_id);

-- -------------------------------------------------------------------- runs --
--
-- One row per background sweep, with a lease, in the shape `description_runs`
-- and `gmail_import_jobs` already use: whoever picks it up claims it, works
-- until the budget is spent, writes what it did and releases it. A run whose
-- lease has expired is free for the cron, so closing a tab strands nothing.

create table if not exists public.sales_runs (
  id uuid primary key default gen_random_uuid(),

  kind text not null
    check (kind in ('research', 'qualify', 'score', 'contacts', 'draft', 'send', 'replies')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  reason text,
  dry_run boolean not null default false,

  looked integer not null default 0,
  succeeded integer not null default 0,
  failed integer not null default 0,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  credits_spent integer not null default 0,

  leased_until timestamptz,

  started_by text,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  error text
);

create index if not exists sales_runs_kind_idx on public.sales_runs (kind, started_at desc);
create index if not exists sales_runs_live_idx on public.sales_runs (kind) where status = 'running';

-- ------------------------------------------------------- updated_at triggers --

do $$
begin
  create trigger sales_settings_set_updated_at
    before update on public.sales_settings
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger prospects_set_updated_at
    before update on public.prospects
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger prospect_contacts_set_updated_at
    before update on public.prospect_contacts
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger sales_campaigns_set_updated_at
    before update on public.sales_campaigns
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger outbound_emails_set_updated_at
    before update on public.outbound_emails
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------- policies --
--
-- Admin only, every one of them, and no customer-facing policy on any table.
-- That is the arrangement `service_costs` and `website_contacts` use: an
-- internal table with one policy is the only shape row level security can
-- actually guarantee, because it cannot hide a column from somebody who can
-- read the row.

alter table public.sales_settings enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_pages enable row level security;
alter table public.prospect_qualifications enable row level security;
alter table public.prospect_contacts enable row level security;
alter table public.hunter_lookups enable row level security;
alter table public.sales_campaigns enable row level security;
alter table public.campaign_steps enable row level security;
alter table public.outbound_emails enable row level security;
alter table public.sales_suppressions enable row level security;
alter table public.sales_replies enable row level security;
alter table public.prospect_events enable row level security;
alter table public.prospect_attributions enable row level security;
alter table public.sales_runs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales_settings', 'prospects', 'prospect_pages', 'prospect_qualifications',
    'prospect_contacts', 'hunter_lookups', 'sales_campaigns', 'campaign_steps',
    'outbound_emails', 'sales_suppressions', 'sales_replies', 'prospect_events',
    'prospect_attributions', 'sales_runs'
  ]
  loop
    begin
      execute format(
        'create policy "Admins manage %1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())',
        t
      );
    exception
      when duplicate_object then null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Is this address on the do-not-contact list?
--
-- Matches the address itself and the domain it belongs to, so suppressing a
-- company suppresses everyone at it. Case-insensitive, because an unsubscribe
-- arrives however the sender's client capitalised it.
-- ---------------------------------------------------------------------------
create or replace function public.sales_is_suppressed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sales_suppressions s
    where lower(s.email) = lower(trim(coalesce(p_email, '')))
       or (
         s.domain is not null
         and lower(s.domain) = lower(split_part(trim(coalesce(p_email, '')), '@', 2))
       )
  );
$$;

revoke all on function public.sales_is_suppressed(text) from public;
revoke all on function public.sales_is_suppressed(text) from anon;
revoke all on function public.sales_is_suppressed(text) from authenticated;

-- ---------------------------------------------------------------------------
-- The two rules that cannot be left to the caller
--
-- A human approves, and a suppression wins. Both are enforced here rather
-- than in the service, because what is being prevented is an email that has
-- already left - and the next caller to write a send path is not in a
-- position to remember either rule.
--
-- Cancelling is always allowed, including from a suppressed row: stopping is
-- never the thing to refuse.
-- ---------------------------------------------------------------------------
create or replace function public.outbound_emails_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'draft', 'needs_review') then
    return new;
  end if;

  if new.status in ('approved', 'scheduled', 'sent')
     and (new.approved_by is null or new.approved_at is null) then
    raise exception
      'An outbound email cannot be approved, scheduled or sent without a named approver';
  end if;

  if new.status in ('approved', 'scheduled', 'sent')
     and public.sales_is_suppressed(new.to_address) then
    raise exception
      'That address is on the do-not-contact list';
  end if;

  return new;
end;
$$;

do $$
begin
  create trigger outbound_emails_guard_trigger
    before insert or update on public.outbound_emails
    for each row execute function public.outbound_emails_guard();
exception when duplicate_object then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hunter credits in the current cycle
--
-- Summed from the ledger, the same arrangement as `ahrefs_units_this_cycle`:
-- available when Hunter is not, and counting what we spent rather than what
-- the whole account spent.
-- ---------------------------------------------------------------------------
create or replace function public.hunter_cycle_start()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  with s as (select hunter_cycle_day from public.sales_settings where id),
  candidate as (
    select make_timestamptz(
      extract(year from timezone('utc', now()))::int,
      extract(month from timezone('utc', now()))::int,
      (select hunter_cycle_day from s),
      0, 0, 0, 'UTC'
    ) as day
  )
  select case
    when day <= timezone('utc', now()) then day
    else day - interval '1 month'
  end
  from candidate;
$$;

create or replace function public.hunter_credits_this_cycle()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(credits_charged), 0)::integer
  from public.hunter_lookups
  where created_at >= public.hunter_cycle_start();
$$;

revoke all on function public.hunter_cycle_start() from public;
revoke all on function public.hunter_cycle_start() from anon;
revoke all on function public.hunter_cycle_start() from authenticated;
revoke all on function public.hunter_credits_this_cycle() from public;
revoke all on function public.hunter_credits_this_cycle() from anon;
revoke all on function public.hunter_credits_this_cycle() from authenticated;

-- ---------------------------------------------------------------------------
-- Model spend this calendar month
--
-- Summed from what the API reported, across both the things that call it.
-- Calendar month rather than a configurable cycle because the Anthropic
-- allowance works that way and a second cycle day to keep in step is a second
-- thing to get wrong.
-- ---------------------------------------------------------------------------
create or replace function public.sales_ai_spend_this_month()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select sum(cost_usd)
      from public.prospect_qualifications
      where created_at >= date_trunc('month', timezone('utc', now()))
    ), 0
  ) + coalesce(
    (
      select sum(cost_usd)
      from public.outbound_emails
      where created_at >= date_trunc('month', timezone('utc', now()))
    ), 0
  );
$$;

revoke all on function public.sales_ai_spend_this_month() from public;
revoke all on function public.sales_ai_spend_this_month() from anon;
revoke all on function public.sales_ai_spend_this_month() from authenticated;

-- ---------------------------------------------------------------------------
-- How many we have sent today
--
-- Against the daily cap. A cap on sends per day is the difference between
-- outbound and a mail provider deciding we are a spam source, and it is
-- counted from what was sent rather than from what was scheduled.
-- ---------------------------------------------------------------------------
create or replace function public.sales_sent_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.outbound_emails
  where status = 'sent'
    and sent_at >= date_trunc('day', timezone('utc', now()));
$$;

revoke all on function public.sales_sent_today() from public;
revoke all on function public.sales_sent_today() from anon;
revoke all on function public.sales_sent_today() from authenticated;

-- ---------------------------------------------------------------------------
-- The emails to send next
--
-- Approved, due, not suppressed, inside the daily cap, and at most
-- `per_domain_open_cap` in flight per company. The per-domain cap is the one
-- that is easy to leave out and the one that stops the same business hearing
-- from us three times in a morning because three of its people were found.
--
-- `volatile` and bounded by the caller's limit, in the shape
-- `ahrefs_due_domains` uses - and the caller re-asks between batches rather
-- than reading one long list, because PostgREST silently truncates a
-- set-returning result at a thousand rows.
-- ---------------------------------------------------------------------------
create or replace function public.sales_sendable(p_limit integer)
returns table (
  id uuid,
  prospect_id uuid,
  to_address text,
  subject text,
  body_text text,
  body_html text,
  step_number smallint
)
language sql
volatile
security definer
set search_path = public
as $$
  with s as (select * from public.sales_settings where id),
  remaining as (
    select greatest(0, (select daily_send_cap from s) - public.sales_sent_today()) as allowed
  ),
  ranked as (
    select
      e.id,
      e.prospect_id,
      e.to_address,
      e.subject,
      e.body_text,
      e.body_html,
      e.step_number,
      row_number() over (
        partition by lower(split_part(e.to_address, '@', 2))
        order by e.scheduled_at nulls first, e.created_at
      ) as per_domain
    from public.outbound_emails e
    cross join s
    where e.status in ('approved', 'scheduled')
      and (e.scheduled_at is null or e.scheduled_at <= timezone('utc', now()))
      and not public.sales_is_suppressed(e.to_address)
  )
  select r.id, r.prospect_id, r.to_address, r.subject, r.body_text, r.body_html, r.step_number
  from ranked r
  cross join s
  cross join remaining
  where r.per_domain <= s.per_domain_open_cap
  order by r.per_domain, r.id
  limit least(greatest(0, p_limit), (select allowed from remaining));
$$;

revoke all on function public.sales_sendable(integer) from public;
revoke all on function public.sales_sendable(integer) from anon;
revoke all on function public.sales_sendable(integer) from authenticated;

-- ---------------------------------------------------------------------------
-- Claiming a sweep
--
-- One run per kind at a time, and a run still holding a lease after an hour
-- is treated as dead - a function killed mid-flight would otherwise block its
-- sweep forever, which is what `start_refresh_run` is written to avoid.
-- ---------------------------------------------------------------------------
create or replace function public.sales_claim_run(p_kind text, p_dry_run boolean, p_by text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.sales_runs
     set status = 'failed',
         error = 'Abandoned: lease expired',
         finished_at = timezone('utc', now())
   where status = 'running'
     and kind = p_kind
     and (leased_until is null or leased_until < timezone('utc', now()) - interval '1 hour');

  if exists (select 1 from public.sales_runs where status = 'running' and kind = p_kind) then
    return null;
  end if;

  insert into public.sales_runs (kind, dry_run, started_by, leased_until)
  values (p_kind, coalesce(p_dry_run, false), p_by, timezone('utc', now()) + interval '5 minutes')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.sales_claim_run(text, boolean, text) from public;
revoke all on function public.sales_claim_run(text, boolean, text) from anon;
revoke all on function public.sales_claim_run(text, boolean, text) from authenticated;
