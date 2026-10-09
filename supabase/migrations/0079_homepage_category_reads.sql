-- ---------------------------------------------------------------------------
-- 0079  What a publisher's homepage says it is about
--
-- 0077 stopped the marketplace calling an uncategorised listing a technology
-- site; 0078 made the 1,840 findable. This is where an answer for them gets
-- recorded.
--
-- Majestic cannot answer it. Of those 1,840, only 167 carry a topical trust
-- flow reading above `MIN_TOPIC_VALUE` and only 38 carry one that is not
-- `Regional/*` - at most 2%, and that is an upper bound. Its topics describe
-- who links to a site in any case, not what the site publishes.
--
-- ## One row per site read, not one per proposal
--
-- `website_category_reads` records that a homepage was read and what came of
-- it - including when nothing did. A read that produced no category is worth
-- as much as one that did: without it the next run fetches the same parked
-- domain again, and the one after that.
--
-- So `niche` is nullable and `declined_because` says why when it is null.
-- The four reasons come from `readNiche` and they are not the same problem:
-- `model-said-unknown` is a site nobody can categorise from its homepage,
-- `quote-not-on-the-page` is an answer that failed its own check and is
-- worth running again.
--
-- ## It is a proposal until a person applies it
--
-- Nothing in this table is a category. `applied_at` is set when somebody
-- presses Accept, and only then does `websites.primary_category_id` move.
-- The arrangement `draft-approval.ts` has, and the gap finder's competitor
-- suggestions, and Majestic's own.
--
-- ## Where the category came from, kept
--
-- `websites.primary_category_source` is the parallel of `country_source`,
-- which exists because a country guessed from a domain suffix was being
-- stored as though somebody had stated it. A category applied from a
-- homepage read is a judgement made from evidence; one typed in by a person
-- is a decision. Keeping them apart is what lets a future run re-read the
-- inferred ones without touching the stated ones, and what lets anybody ask
-- how much of the marketplace is categorised by model.
--
-- Null means the question was never asked - every row before this migration.
--
-- ## Internal, on the terms AGENTS.md sets
--
-- `website_category_reads` holds what we paid for and what a model thought.
-- Admin-only policy, no customer-facing policy at all, like
-- `service_costs`, `website_commercials` and `listing_drafts`.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

/*
  Where the category came from.

  Text rather than an enum: the set will grow - majestic, homepage, importer
  - and an enum needs a migration to add a value while a check constraint
  does not. The constraint is still there, because a typo that silently
  becomes a new source is the thing being prevented.
*/
alter table public.websites
  add column if not exists primary_category_source text;

do $$
begin
  alter table public.websites
    add constraint websites_primary_category_source_check
    check (primary_category_source is null
           or primary_category_source in ('stated', 'majestic', 'homepage'));
exception
  when duplicate_object then null;
end;
$$;

comment on column public.websites.primary_category_source is
  'How the primary category was decided: stated by a person, suggested by Majestic, or read from the homepage. Null means nobody has recorded it - the parallel of country_source, which exists because a guess was once stored as a statement.';

create table if not exists public.website_category_reads (
  -- One row per site. A re-read replaces what the last one found rather than
  -- stacking, because two live proposals for one listing is a question
  -- nobody asked.
  website_id uuid primary key references public.websites (id) on delete cascade,

  -- The proposal. Null when the read produced none.
  niche text,
  confidence integer,
  /*
    The sentence the category was read from, copied from the page.

    Stored because it is what the person reviewing is actually judging - a
    category with no evidence beside it is a thing to agree with rather than
    a thing to check. `readNiche` has already confirmed it appears in the
    page text.
  */
  quote text not null default '',
  reason text not null default '',

  -- Why there is no proposal: model-said-unknown, below-the-floor,
  -- no-quote, quote-not-on-the-page, or a fetch failure.
  declined_because text,

  -- What was read, so a bad answer can be traced to the page it came from.
  page_url text,
  http_status integer,

  -- What produced it. Both are needed to find the answers made under a rule
  -- that turned out to be wrong - the reason every prompt here is versioned.
  prompt_version text not null,
  model text not null,

  -- Spend, measured rather than estimated, as AGENTS.md requires: the
  -- figures the API reported for this call.
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,

  read_at timestamptz not null default timezone('utc', now()),

  -- Set when somebody presses Accept. Until then this row has changed
  -- nothing about the listing.
  applied_at timestamptz,
  applied_by text,

  constraint website_category_reads_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 100)),
  -- A row says either what it found or why it found nothing, never both and
  -- never neither.
  constraint website_category_reads_outcome_check
    check ((niche is not null and declined_because is null)
           or (niche is null and declined_because is not null))
);

comment on table public.website_category_reads is
  'What reading a publisher''s homepage concluded about its category, and what that cost. A proposal until applied_at is set; a declined read is recorded too, so the next run does not fetch the same parked domain again.';

-- Finding the queue: the reads nobody has acted on, strongest first.
create index if not exists website_category_reads_pending_idx
  on public.website_category_reads (confidence desc)
  where applied_at is null and niche is not null;

alter table public.website_category_reads enable row level security;

/*
  Admin only, and no customer-facing policy at all.

  The terms AGENTS.md sets for internal data. This holds what a model thought
  and what the call cost; neither is a customer's business, and row level
  security cannot hide a column.
*/
do $$
begin
  create policy "Admins manage homepage category reads"
    on public.website_category_reads for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;
