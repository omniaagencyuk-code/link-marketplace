-- ---------------------------------------------------------------------------
-- 0092  A publisher offering us their site
--
-- The sourcing pipeline already knows what to do with a publisher who wants
-- to sell a placement: 0019 reads their email, extracts a draft, and a person
-- approves it. What there was no way to do was *invite* one. A publisher
-- reaches us today only by finding an address and writing unprompted.
--
-- /list-your-site is that invitation, and this is where its form lands.
--
-- ## Why this is not a `listing_draft`
--
-- Tempting, because the queue a person reads is the same one. Three reasons
-- it is wrong, and the first is fatal on its own:
--
--   * `listing_drafts.email_id` is not null and references `inbound_emails`.
--     A form submission would need an email invented for it that nobody
--     ever sent.
--   * Every draft records `prompt_version` and `extraction_model`, so a rule
--     that turns out to be wrong can be found and the drafts made under it
--     re-read. A form was read by no rules and no model; stamping it with a
--     version would make that record a lie.
--   * `confidence` and `evidence` are per-field judgements about an
--     extraction. A publisher typing their own price is not an extraction
--     anybody was uncertain about.
--
-- A person can still read one and create a listing from it. What is not
-- collapsed is where the two came from, which is the thing that cannot be
-- recovered afterwards.
--
-- ## Internal, on the terms AGENTS.md sets
--
-- A named person's address, the site they own and what they want paid for a
-- placement. The price in particular is `website_niche_costs`-grade: it is
-- what we would *pay*, and `websites` is readable by every signed-in
-- customer. So: admin policy only, and no customer-facing policy at all.
--
-- This is the second table a stranger can cause a row in, after
-- `pricing_enquiries`, and it gets the same arrangement for the same reason:
-- no insert policy at all, writes through a server action running as the
-- service role which throttles first. An insert policy for `anon` would be a
-- second door into it, unthrottled, from any browser holding the anon key.
--
-- ## What is deliberately not collected
--
-- No domain rating, no traffic, no referring domains. We measure those from
-- Ahrefs and Majestic; a figure a seller types about their own site is one
-- we would have to disbelieve before we could use it.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.publisher_submissions (
  id uuid primary key default gen_random_uuid(),

  -- What they told us. Trimmed and bounded, because a stranger can cause
  -- this write.
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text not null check (position('@' in email) > 1 and length(email) <= 320),

  -- Normalised the way the importer normalises - lowercase, no protocol, no
  -- www - so "https://www.example.com/write-for-us" and "example.com" are
  -- one site rather than two rows nobody connects.
  domain text not null check (length(btrim(domain)) between 3 and 253),

  placement_type text check (placement_type is null or length(placement_type) <= 40),

  /*
    The price, in minor units, and never without its currency.

    The paired check is the point of storing it this way. A number whose
    currency we had to guess becomes what we think a placement costs - the
    same mistake `repeat-offers.ts` has a floor against from the other
    direction - so the column pair can hold both or neither.
  */
  price_minor integer check (price_minor is null or price_minor > 0),
  currency text check (currency is null or currency in ('GBP', 'USD', 'EUR')),
  constraint publisher_submissions_price_has_currency
    check ((price_minor is null) = (currency is null)),

  message text check (message is null or length(btrim(message)) between 1 and 4000),

  -- Where it came from, set by us and never by the form.
  source text not null default 'list-your-site' check (length(source) <= 40),

  /*
    Set at write time when we already hold a listing for the domain.

    This is the first thing whoever reads the queue needs: an offer against a
    site we already carry is a price somebody is changing, not a site we are
    gaining, and the two are worked differently. `on delete set null` because
    losing the listing must not lose the offer.
  */
  matched_website_id uuid references public.websites (id) on delete set null,

  /*
    Five states. An enquiry is answered and closed; an offer of a site ends
    with the site listed or not, and which way it went is the only part worth
    knowing a year later when the same domain writes in again.
  */
  status text not null default 'new'
    check (status in ('new', 'in-progress', 'listed', 'declined', 'spam')),
  handled_by text,
  handled_at timestamptz,
  notes text check (notes is null or length(notes) <= 4000),

  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.publisher_submissions is
  'Publishers offering a site through /list-your-site. Internal: a named person''s address and what they want paid. No customer-facing policy.';

comment on column public.publisher_submissions.price_minor is
  'Minor units, and never stored without a currency - a number whose currency was guessed becomes a cost we never agreed.';

comment on column public.publisher_submissions.matched_website_id is
  'The listing we already hold for this domain, where there is one. An offer against a site we carry is a price change, not a new site.';

-- The admin list is newest first, usually filtered to what has not been dealt
-- with. One index answers both.
create index if not exists publisher_submissions_status_created_idx
  on public.publisher_submissions (status, created_at desc);

create index if not exists publisher_submissions_created_idx
  on public.publisher_submissions (created_at desc);

-- "Has this domain written in before" is the question asked of every row that
-- arrives, and it is asked by domain.
create index if not exists publisher_submissions_domain_idx
  on public.publisher_submissions (domain);

alter table public.publisher_submissions enable row level security;

/*
  One policy, and it is the admin's. No `anon` insert policy: the form writes
  through the service role, so the public can submit one without the table
  being writable by anyone holding the anon key.
*/
do $$ begin
  create policy "Admins manage publisher submissions"
    on public.publisher_submissions for all
    using (public.is_admin())
    with check (public.is_admin());
exception when duplicate_object then null; end; $$;
