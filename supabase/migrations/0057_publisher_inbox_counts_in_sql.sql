-- ---------------------------------------------------------------------------
-- 0057  Count in the database, not in Node
--
-- The publisher inbox got slower every time somebody approved a draft, and the
-- reason is that two of its reads pull whole tables across the wire to compute
-- a handful of numbers.
--
-- **The duplicate finder.** `contestedDrafts()` reads every draft whose status
-- is `pending` *or* `approved` - and approved drafts accumulate for ever - with
-- its `proposed` jsonb and a join to the email it came from, in 500-row pages
-- through `readAllPages`, then groups them in JavaScript to find the domains
-- offered more than once. Measured against 5,000 open drafts and 6,000 emails:
-- every page re-sorts all 5,000 rows and re-hashes all 6,000 emails, 44ms of
-- database time each, ten round trips, 2.5MB transferred - to find 800
-- contested domains. The grouping is one `having count(*) > 1`.
--
-- **The status tiles.** The page selects `status, batch_id` for every row in
-- `inbound_emails` and counts them in a `reduce`. PostgREST caps a
-- set-returning read at a thousand rows without saying so, so past a thousand
-- emails this was both slow and wrong: the tiles showed the make-up of
-- whichever thousand came back, not of the inbox.
--
-- Both become one round trip returning what the page displays.
--
-- `security definer` and revoked from the customer roles, like every other
-- function over internal tables: `inbound_emails` and `listing_drafts` have no
-- customer-facing policy and nothing here should become a way around that.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

/* Supports the grouping and the lookup that follows it. `listing_drafts` has
   an index on `domain` and one on `status`, and neither answers "group the
   open drafts by domain" without reading the table. */
create index if not exists listing_drafts_open_domain_idx
  on public.listing_drafts (domain, id)
  where status in ('pending', 'approved');

-- ---------------------------------------------------------------------------
-- Only the drafts whose domain was offered more than once
--
-- Same rows the application used to filter down to, chosen by the database.
-- `pending` and `approved` both count: the case this exists for is a domain
-- quoted twice where one quote has already been approved, and dropping the
-- approved side would make that look uncontested.
-- ---------------------------------------------------------------------------
create or replace function public.sourcing_contested_drafts()
returns table (
  draft_id uuid,
  domain text,
  status text,
  proposed jsonb,
  from_address text,
  sent_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with contested as (
    select d.domain
    from public.listing_drafts d
    where d.status in ('pending', 'approved')
    group by d.domain
    having count(*) > 1
  )
  select d.id, d.domain, d.status, d.proposed, e.from_address, e.sent_at
  from public.listing_drafts d
  join contested c on c.domain = d.domain
  left join public.inbound_emails e on e.id = d.email_id
  where d.status in ('pending', 'approved')
  order by d.domain asc, d.id asc;
$$;

revoke all on function public.sourcing_contested_drafts() from public;
revoke all on function public.sourcing_contested_drafts() from anon;
revoke all on function public.sourcing_contested_drafts() from authenticated;

-- ---------------------------------------------------------------------------
-- The inbox tiles
--
-- `new` with a batch is its own state and the one worth showing: somebody is
-- already waiting on it, and it is not something to press the button about.
-- That split was being done in JavaScript over rows that may never have
-- arrived.
-- ---------------------------------------------------------------------------
create or replace function public.sourcing_email_counts()
returns table (status text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when e.status = 'new' and e.batch_id is not null then 'in-flight' else e.status end,
    count(*)
  from public.inbound_emails e
  group by 1;
$$;

revoke all on function public.sourcing_email_counts() from public;
revoke all on function public.sourcing_email_counts() from anon;
revoke all on function public.sourcing_email_counts() from authenticated;
