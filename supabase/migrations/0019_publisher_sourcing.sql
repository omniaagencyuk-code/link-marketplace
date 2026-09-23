-- ---------------------------------------------------------------------------
-- Sourcing publishers from their own emails
--
-- Jack asks a site for rates; the publisher replies in free text, in any
-- language, sometimes covering a dozen domains at once. Today that becomes a
-- hand-made CSV, which loses most of the reply and leaves no record of who
-- said what. This holds the email, the structured reading of it, and the
-- human decision that turned it into a listing.
--
-- The dividing line running through all of it: `websites` is readable by
-- every signed-in customer (0002: "status = 'active' or is_admin()"), and row
-- level security cannot hide one column. So a publishing term that a buyer
-- may see goes on `websites`, and anything with money or commercial terms in
-- it goes in an admin-only table with no customer policy - the same rule
-- 0008 set for cost prices and 0017 for contacts.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- tri-state --
-- "Not stated" is not "no". The whole point of the review queue is that a
-- blank in an email means we do not know, and a listing that records that as
-- a refusal is worse than one that records nothing.
do $$
begin
  create type public.niche_stance as enum ('yes', 'no', 'unknown');
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------------------- per-niche acceptance --
-- `websites.accepted_niches` is a yes-list: it cannot say "we asked and they
-- refused". This can. The array stays the source for the marketplace filters
-- and is kept in step on approval, exactly as the five legacy booleans are
-- already kept in step with the array.
--
-- Customer-readable, because which topics a site accepts is a marketplace
-- fact a buyer filters on. There is no price in this table.
create table if not exists public.website_niche_policy (
  website_id uuid not null references public.websites (id) on delete cascade,
  niche text not null,
  accepted public.niche_stance not null default 'unknown',
  link_insertion_offered public.niche_stance not null default 'unknown',
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  primary key (website_id, niche)
);

alter table public.website_niche_policy enable row level security;

do $$
begin
  create policy "Signed-in users read niche policy"
    on public.website_niche_policy for select to authenticated using (true);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Admins manage niche policy"
    on public.website_niche_policy for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger website_niche_policy_set_updated_at
    before update on public.website_niche_policy
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------- per-niche buy price --
-- The mirror of `website_niche_prices` (0015) on the cost side. Separate
-- table, admin-only policy, no customer policy at all: what we pay a
-- publisher for a gambling post is the one number a customer must never see.
create table if not exists public.website_niche_costs (
  website_id uuid not null references public.websites (id) on delete cascade,
  niche text not null,
  link_type public.link_type not null,
  cost_minor integer not null check (cost_minor > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,
  primary key (website_id, niche, link_type)
);

comment on table public.website_niche_costs is
  'What we pay per niche. Internal only - no customer-facing policy exists, deliberately.';

alter table public.website_niche_costs enable row level security;

do $$
begin
  create policy "Admins manage niche costs"
    on public.website_niche_costs for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger website_niche_costs_set_updated_at
    before update on public.website_niche_costs
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------- the publisher writing it themselves --
-- A second rate on the same placement rather than a second placement type:
-- adding a `link_type` would put a new product in front of customers, which
-- this feature is not for.
alter table public.service_costs
  add column if not exists cost_publisher_written_minor integer;

do $$
begin
  alter table public.service_costs
    add constraint service_costs_publisher_written_check
    check (cost_publisher_written_minor is null or cost_publisher_written_minor > 0);
exception
  when duplicate_object then null;
end;
$$;

comment on column public.service_costs.cost_publisher_written_minor is
  'What we pay when the publisher writes the article. cost_price_minor is always the rate when we supply it.';

-- ------------------------------------------------- publishing terms (public) --
-- These describe how a placement behaves, not what it costs, so they live
-- with the other publishing rules a buyer can already see.
alter table public.websites
  add column if not exists dofollow_expires_after_months smallint
    check (dofollow_expires_after_months is null or dofollow_expires_after_months > 0);

alter table public.websites
  add column if not exists permanence text
    check (permanence is null or permanence in ('permanent', 'fixed-term'));

alter table public.websites
  add column if not exists min_live_months smallint
    check (min_live_months is null or min_live_months > 0);

alter table public.websites
  add column if not exists homepage_placement boolean;

alter table public.websites
  add column if not exists topic_restriction text;

comment on column public.websites.topic_restriction is
  'What the publisher will only cover, in their words - e.g. "Chelsea FC only". Free text on purpose: it is a sentence, not a taxonomy.';

comment on column public.websites.homepage_placement is
  'Does the article appear on the homepage. Null means not stated.';

-- ------------------------------------------ commercial terms (admin only) --
-- One row per website, holding everything that is about the deal rather than
-- the placement. No customer policy, for the same reason as the costs above:
-- our payment terms, VAT position and price validity are ours.
create table if not exists public.website_commercials (
  website_id uuid primary key references public.websites (id) on delete cascade,

  -- The publisher's own currency, never converted. Their rates are quoted in
  -- it and stored in it; converting on the way in would lose the number they
  -- actually agreed to.
  cost_currency char(3),

  homepage_link_cost_minor integer check (homepage_link_cost_minor is null or homepage_link_cost_minor > 0),
  homepage_link_period text check (homepage_link_period is null or homepage_link_period in ('month', 'year', 'one-off')),
  banner_cost_minor integer check (banner_cost_minor is null or banner_cost_minor > 0),
  banner_period text check (banner_period is null or banner_period in ('month', 'year', 'one-off')),

  prices_exclude_vat boolean,
  vat_notes text,

  payment_methods text[] not null default '{}',
  payment_timing text check (payment_timing is null or payment_timing in ('prepaid', 'on-publication', 'after-live-link')),

  minimum_order text,
  bulk_discount_notes text,

  price_valid_until date,
  future_price_notes text,

  -- Where these terms came from, and when they were last confirmed.
  source_email_id uuid,
  last_quoted_at timestamptz,

  notes text,

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

comment on table public.website_commercials is
  'Commercial terms agreed with the publisher. Internal only - no customer-facing policy exists, deliberately.';

alter table public.website_commercials enable row level security;

do $$
begin
  create policy "Admins manage website commercials"
    on public.website_commercials for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger website_commercials_set_updated_at
    before update on public.website_commercials
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------------ the mailbox --
create table if not exists public.inbound_emails (
  id uuid primary key default gen_random_uuid(),

  -- The dedupe key. Re-uploading the same Takeout export must be a no-op,
  -- and Message-ID is the only identifier that survives an export intact.
  message_id text not null unique,

  from_address text not null,
  from_name text,
  to_address text,
  subject text,
  sent_at timestamptz,

  -- Quoted history stripped, which is what goes to the model: our own
  -- outreach quoted underneath a two-line reply is most of the tokens and
  -- none of the answer.
  body_text text not null default '',
  -- Kept whole so a bad strip can be re-read without another upload.
  body_raw text not null default '',

  -- The domain our outreach asked about, recovered from the thread or from
  -- the "Advertisements on {domain}" subject. The reply often never names it.
  asked_about_domain text,

  status text not null default 'new'
    check (status in ('new', 'extracted', 'failed', 'ignored')),
  -- Why it was ignored or how it failed. Always populated for those two.
  status_reason text,

  extracted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.inbound_emails is
  'Publisher replies, as received. Internal only - no customer-facing policy exists, deliberately.';

create index if not exists inbound_emails_status_idx on public.inbound_emails (status, sent_at desc);

alter table public.inbound_emails enable row level security;

do $$
begin
  create policy "Admins manage inbound emails"
    on public.inbound_emails for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger inbound_emails_set_updated_at
    before update on public.inbound_emails
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------- the review queue --
create table if not exists public.listing_drafts (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.inbound_emails (id) on delete cascade,

  -- Normalised the same way the CSV importer normalises: lowercase, no
  -- protocol, no www. One reply covering ten sites makes ten rows.
  domain text not null,
  matched_website_id uuid references public.websites (id) on delete set null,

  -- The proposed values, the model's confidence per field, and the quote it
  -- read each one from. Three objects keyed the same way rather than one
  -- object of triples, so the review UI can ask "which fields are low" in one
  -- pass without walking every value.
  --
  -- Named `proposed` rather than `values`: VALUES is a reserved word, and
  -- while the server accepts it as a column name, the Supabase SQL editor
  -- parses statements itself and refuses. Quoting it would work and would
  -- leave every future query needing the quotes to be remembered.
  proposed jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  low_confidence_count smallint not null default 0,

  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'merged')),
  reject_reason text,

  -- What produced this, so a bad batch can be found and re-run after the
  -- prompt or the model changes.
  extraction_model text,
  prompt_version text,

  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- Re-extracting an email replaces its drafts rather than doubling them.
  unique (email_id, domain)
);

comment on table public.listing_drafts is
  'AI-extracted listing proposals awaiting human approval. Internal only - no customer-facing policy exists, deliberately.';

create index if not exists listing_drafts_status_idx on public.listing_drafts (status, created_at desc);
create index if not exists listing_drafts_domain_idx on public.listing_drafts (domain);

alter table public.listing_drafts enable row level security;

do $$
begin
  create policy "Admins manage listing drafts"
    on public.listing_drafts for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger listing_drafts_set_updated_at
    before update on public.listing_drafts
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- The link is added after both tables exist, and only once.
do $$
begin
  alter table public.website_commercials
    add constraint website_commercials_source_email_fkey
    foreign key (source_email_id) references public.inbound_emails (id) on delete set null;
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------- extraction batches --
-- The Batch API is asynchronous: a run is submitted, an id comes back, and
-- the results arrive later. That id has to live somewhere, or a submitted
-- batch is money spent with nothing to collect it against.
--
-- Real-time runs get a row too, with no provider id. One table means the
-- admin page shows "what did we extract, when, at what cost" the same way
-- whichever mode produced it.
create table if not exists public.extraction_batches (
  id uuid primary key default gen_random_uuid(),
  -- Null for a real-time run: there is no batch to collect.
  provider_batch_id text unique,
  mode text not null check (mode in ('realtime', 'batch')),
  model text not null,
  prompt_version text not null,

  status text not null default 'submitted'
    check (status in ('submitted', 'running', 'completed', 'failed', 'cancelled')),
  status_reason text,

  email_count smallint not null default 0,
  succeeded_count smallint not null default 0,
  failed_count smallint not null default 0,

  -- What it actually cost, read back from the response rather than assumed.
  input_tokens integer,
  output_tokens integer,

  submitted_by text,
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.extraction_batches enable row level security;

do $$
begin
  create policy "Admins manage extraction batches"
    on public.extraction_batches for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger extraction_batches_set_updated_at
    before update on public.extraction_batches
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

alter table public.inbound_emails
  add column if not exists batch_id uuid references public.extraction_batches (id) on delete set null;

create index if not exists inbound_emails_batch_idx on public.inbound_emails (batch_id);

-- Things the reviewer needs telling that are not field values: "one price,
-- no niches named", "offered a different site than the one we asked about".
alter table public.listing_drafts
  add column if not exists flags text[] not null default '{}';

comment on column public.listing_drafts.flags is
  'Reviewer prompts, e.g. single-price-confirm-niches. Not field data - things a human must decide.';

-- -------------------------------------------------------------- the switch --
-- One row. Extraction is off until somebody turns it on, and the mode is a
-- setting rather than a deploy: the first runs go through real time so the
-- drafts can be read immediately, and the switch to Batch happens when the
-- results are trusted, without touching code.
create table if not exists public.sourcing_settings (
  id smallint primary key default 1 check (id = 1),

  -- Off by default. Uploading and parsing emails costs nothing and works
  -- with this false; only the call to the model is gated.
  enabled boolean not null default false,

  mode text not null default 'realtime' check (mode in ('realtime', 'batch')),
  model text not null default 'claude-opus-5',

  -- A ceiling, checked before a run is submitted. Spend is measured from the
  -- tokens the API reports, never estimated.
  monthly_budget_usd numeric(10, 2) not null default 25.00,

  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

insert into public.sourcing_settings (id) values (1) on conflict (id) do nothing;

alter table public.sourcing_settings enable row level security;

do $$
begin
  create policy "Admins manage sourcing settings"
    on public.sourcing_settings for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger sourcing_settings_set_updated_at
    before update on public.sourcing_settings
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;
