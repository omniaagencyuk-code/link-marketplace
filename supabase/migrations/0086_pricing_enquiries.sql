-- ---------------------------------------------------------------------------
-- 0086  Somebody asking what a bigger order would cost
--
-- The pricing page stops selling subscriptions and starts inviting a
-- conversation: an agency placing links every month, a team with one large
-- campaign, somebody with a list of domains and a budget. The form they fill
-- in has to land somewhere a person will look.
--
-- ## Why this is not a `prospect`
--
-- The Sales Centre already holds companies we have decided to approach, and
-- putting an inbound enquiry in there looked tempting - `prospects.source`
-- even has an 'inbound' value. Three reasons it is wrong:
--
--   * `prospects.domain` is unique and not null. A person writing from a
--     Gmail address has no company domain, and two people at one agency
--     enquiring a month apart are two enquiries and one prospect. One of
--     those collides and the other overwrites.
--   * A prospect is an outbound target, carried into campaigns, scoring and
--     `outbound_emails`. Somebody who has just asked us a question should
--     not become somebody we cold-email, and `sales_suppressions` could then
--     block the reply they are waiting for.
--   * A prospect is a judgement we formed. An enquiry is what a person told
--     us. Mixing them means never being able to say which is which.
--
-- ## Internal, on the terms AGENTS.md sets
--
-- This holds a named person's work address, their employer and what they say
-- they can spend. That is `prospect_contacts`-grade data. So: admin policy
-- only, and no customer-facing policy at all. The enquirer is usually not a
-- signed-in customer, and a customer who is one has no reason to read anyone
-- else's.
--
-- Writes go through the service role, which is how the form can be submitted
-- by somebody with no account at all. The insert is the only thing the
-- public can cause, and every field it can set is bounded below.
--
-- ## What is deliberately not here
--
-- No price, no discount, no agreed rate. This records that a conversation
-- was asked for, not its outcome. If negotiated pricing is ever built, it
-- belongs in its own table against a customer and a listing - not bolted to
-- the first message somebody sent us. `status` is here so an enquiry can be
-- closed off, and nothing more.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.pricing_enquiries (
  id uuid primary key default gen_random_uuid(),

  -- What they told us. Trimmed and bounded, because this is the one table in
  -- the schema a stranger can write to.
  full_name text not null check (length(btrim(full_name)) between 1 and 120),
  email text not null check (position('@' in email) > 1 and length(email) <= 320),
  company text check (company is null or length(btrim(company)) between 1 and 160),

  /*
    Stored as the label the form offered rather than as a number.

    A band is a statement about what somebody expects to spend, not a
    measurement, and turning "£1,000-£2,500" into a figure invents a
    precision the answer never had. The options are a fixed list in
    `src/lib/enquiries/options.ts`; the check here keeps anything else out
    without this table needing to know what the list says.
  */
  budget_band text check (budget_band is null or length(budget_band) <= 40),
  interest text check (interest is null or length(interest) <= 40),

  message text not null check (length(btrim(message)) between 1 and 4000),

  -- Where it came from, so a banner that is working can be told from one
  -- that is not. Set by us, never by the form.
  source text not null default 'pricing-page' check (length(source) <= 40),

  /*
    Handling. Deliberately four states and no workflow: an enquiry is read,
    somebody replies, and it is either still live or it is not.
  */
  status text not null default 'new'
    check (status in ('new', 'in-progress', 'closed', 'spam')),
  handled_by text,
  handled_at timestamptz,
  notes text check (notes is null or length(notes) <= 4000),

  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.pricing_enquiries is
  'Inbound requests for bulk, agency or negotiated pricing. Internal: a named person''s work address and what they say they can spend. No customer-facing policy.';

comment on column public.pricing_enquiries.budget_band is
  'The label the form offered, not a number. A band is what somebody expects to spend, and converting it would invent precision.';

-- The admin list is newest first, usually filtered to what has not been dealt
-- with. One index answers both.
create index if not exists pricing_enquiries_status_created_idx
  on public.pricing_enquiries (status, created_at desc);

create index if not exists pricing_enquiries_created_idx
  on public.pricing_enquiries (created_at desc);

alter table public.pricing_enquiries enable row level security;

/*
  One policy, and it is the admin's.

  No `anon` insert policy: the form writes through the service role, so the
  public can submit one without the table being writable by anyone holding
  the anon key. An insert policy would make it possible to write rows
  straight into this table from a browser, at whatever rate somebody liked,
  which is what the throttle on the action exists to prevent.
*/
do $$ begin
  create policy "Admins manage pricing enquiries"
    on public.pricing_enquiries for all
    using (public.is_admin())
    with check (public.is_admin());
exception when duplicate_object then null; end; $$;
