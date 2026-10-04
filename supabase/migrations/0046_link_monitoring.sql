-- ---------------------------------------------------------------------------
-- 0046  Link monitoring, the guarantee, and the durability score
--
-- Two features on one set of tables: a twelve month replacement guarantee, and
-- a public durability score per listing. Both need the same fact - did this
-- link stay up - so both read the same rows.
--
-- ## The grain is an order item, not an order
--
-- One link is one `order_items` row: it already holds `live_url` (where the
-- article went), `target_url` (where it points) and `website_id`. An order can
-- hold two placements on the same site, so keying on the order would collide
-- the moment somebody bought two. `order_item_id` is the natural key and is
-- unique on its own, which also makes registration idempotent for free.
--
-- ## There is no publisher here
--
-- Publishers are not users of this system. They are contact rows -
-- `website_contacts`, admin-only, an email address and a name - with no login,
-- no account and no balance. So a link's publisher is its listing, and
-- `website_id` is how a claim reaches one: the contact to email hangs off it.
-- A `publisher_id` column would be a foreign key to a table that does not
-- exist, and a publisher-facing policy would protect rows nobody can reach.
--
-- ## Events only on change
--
-- A weekly check over a few thousand links writes hundreds of thousands of
-- rows a year that all say "still fine". `link_status_events` records
-- transitions, so the history is the part worth reading and stays small
-- enough to read.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.link_status as enum ('pending', 'live', 'failing', 'unverifiable', 'lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.claim_status as enum (
    'awaiting_publisher',
    'restored',
    'awaiting_buyer_choice',
    'replacement_requested',
    'refund_requested',
    'closed'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- One row per delivered link
-- ---------------------------------------------------------------------------
create table if not exists public.monitored_links (
  id uuid primary key default gen_random_uuid(),

  -- The placement. Unique: one delivered link, one monitor row, which is what
  -- makes `registerPlacedLink` idempotent without a separate guard.
  order_item_id uuid not null unique references public.order_items (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  website_id uuid not null references public.websites (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,

  -- Where the article is, and where it points.
  placed_url text not null,
  target_url text not null,
  expects_dofollow boolean not null default true,

  published_at timestamptz not null,
  -- Twelve months from publication, set by the application so the window can
  -- be changed for one placement without a migration.
  guarantee_ends_at timestamptz not null,

  status public.link_status not null default 'pending',

  -- Consecutive, not cumulative. Reset on any good check, which is what makes
  -- "two hard failures in a row" mean what it says.
  hard_failures smallint not null default 0 check (hard_failures >= 0),
  soft_failures smallint not null default 0 check (soft_failures >= 0),

  lost_at timestamptz,
  last_checked_at timestamptz,
  last_http_status smallint,
  last_reason text,
  final_url text,
  next_check_at timestamptz not null default timezone('utc', now()),

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- The spec's key, kept as a second guard: the same article pointing at the
  -- same target twice is a duplicate however it was registered.
  constraint monitored_links_placement_once unique (order_id, placed_url, target_url)
);

-- The checker's only query: what is due, oldest first.
--
-- No predicate. The obvious one - skip links that are lost and out of
-- guarantee - cannot be written, because `now()` is not immutable and Postgres
-- refuses it in an index predicate. It would also be wrong: a lost link has to
-- keep being checked, since a publisher putting the article back is exactly
-- what restores a claim.
create index if not exists monitored_links_due_idx
  on public.monitored_links (next_check_at);

create index if not exists monitored_links_website_idx on public.monitored_links (website_id);
create index if not exists monitored_links_buyer_idx on public.monitored_links (buyer_id);

-- ---------------------------------------------------------------------------
-- Status changes, and nothing else
-- ---------------------------------------------------------------------------
create table if not exists public.link_status_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.monitored_links (id) on delete cascade,
  from_status public.link_status,
  to_status public.link_status not null,
  reason text,
  http_status smallint,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists link_status_events_link_idx
  on public.link_status_events (link_id, created_at desc);

-- ---------------------------------------------------------------------------
-- A claim under the guarantee
-- ---------------------------------------------------------------------------
create table if not exists public.guarantee_claims (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.monitored_links (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  -- The publisher, as far as this system knows one: the listing.
  website_id uuid not null references public.websites (id) on delete cascade,

  status public.claim_status not null default 'awaiting_publisher',
  reason text not null default '',
  opened_at timestamptz not null default timezone('utc', now()),
  publisher_deadline timestamptz not null,
  resolved_at timestamptz,

  -- What the buyer paid for the placement, copied at the moment the claim
  -- opens. The item's price can be edited afterwards and a refund has to be
  -- for what was actually charged.
  amount_minor integer not null default 0 check (amount_minor >= 0),
  currency char(3) not null default 'USD',

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- One open claim per link. Partial, so a link that fails again a year later
-- opens a second claim rather than being refused one.
create unique index if not exists guarantee_claims_one_open_idx
  on public.guarantee_claims (link_id)
  where status in ('awaiting_publisher', 'awaiting_buyer_choice');

create index if not exists guarantee_claims_buyer_idx on public.guarantee_claims (buyer_id, status);
create index if not exists guarantee_claims_deadline_idx
  on public.guarantee_claims (publisher_deadline)
  where status = 'awaiting_publisher';

-- ---------------------------------------------------------------------------
-- The score, on the listing
--
-- Stored rather than derived at request time: the marketplace renders hundreds
-- of cards at once and a score computed per card is a query per card. These
-- are written nightly by `recompute_durability_scores`.
--
-- Public by design, which is why they belong on `websites` rather than in an
-- admin-only table - unlike a cost or a contact, the whole point of a
-- durability score is that a buyer sees it before they buy.
-- ---------------------------------------------------------------------------
alter table public.websites
  add column if not exists durability_pct smallint
    check (durability_pct is null or durability_pct between 0 and 100),
  add column if not exists durability_sample integer not null default 0,
  add column if not exists durability_window_months smallint,
  add column if not exists durability_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- Recomputing the scores
--
-- The widest window the evidence supports. Twelve months is the number worth
-- advertising, but a listing whose links are four months old has no twelve
-- month evidence - so it falls back to six, then three, and reports which
-- window it used. A score labelled "after 12 months" drawn from links that are
-- three months old would be a lie told in good faith.
--
-- "Not lost before the mark" rather than "live now": a link that was lost and
-- restored by the publisher survived, which is exactly what the guarantee is
-- for and what a publisher who fixes things deserves credit for.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_durability_scores(min_sample integer default 5)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  touched integer := 0;
begin
  /*
    A temporary table rather than a CTE.

    The first version computed `best` as a CTE and used it in two statements -
    one to write the scores and one to clear listings that no longer qualify.
    A CTE is scoped to its own statement, so the second threw "relation best
    does not exist" on every run. Found by running it; the migration applied
    cleanly and the function was broken.
  */
  drop table if exists best_scores;

  create temp table best_scores on commit drop as
  with windows as (select unnest(array[12, 6, 3]) as months),
  -- Every link old enough to have an opinion about each window.
  eligible as (
    select
      l.website_id,
      w.months,
      -- Survived unless it was lost before reaching the mark. A restoration
      -- clears `lost_at`, so a restored link counts as survived - which is
      -- what the guarantee is for and what a publisher who fixes things
      -- deserves credit for.
      count(*) filter (
        where l.lost_at is null
           or l.lost_at >= l.published_at + make_interval(months => w.months)
      ) as survived,
      count(*) as sample
    from public.monitored_links l
    cross join windows w
    where l.published_at <= timezone('utc', now()) - make_interval(months => w.months)
    group by l.website_id, w.months
  )
  -- The longest window that clears the sample floor.
  select distinct on (website_id) website_id, months, survived, sample
  from eligible
  where sample >= greatest(1, min_sample)
  order by website_id, months desc;

  update public.websites s
  set durability_pct = round((b.survived::numeric / b.sample) * 100),
      durability_sample = b.sample,
      durability_window_months = b.months,
      durability_updated_at = timezone('utc', now())
  from best_scores b
  where s.id = b.website_id;

  get diagnostics touched = row_count;

  -- A listing that no longer clears the floor loses its score rather than
  -- keeping a stale one. Links are deleted with their orders, and a score
  -- nobody can reproduce is worse than no score.
  update public.websites s
  set durability_pct = null,
      durability_sample = 0,
      durability_window_months = null,
      durability_updated_at = timezone('utc', now())
  where s.durability_pct is not null
    and not exists (select 1 from best_scores b where b.website_id = s.id);

  return touched;
end;
$$;

revoke all on function public.recompute_durability_scores(integer) from public;
revoke all on function public.recompute_durability_scores(integer) from anon;
revoke all on function public.recompute_durability_scores(integer) from authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Buyers read their own. Nobody writes: every write is the checker, the cron
-- or an admin action, all of which hold the service role, which bypasses RLS.
-- A write policy here would be a policy for a path that does not exist.
--
-- No publisher policy, because publishers have no login. Their view of a claim
-- is the email we send them.
-- ---------------------------------------------------------------------------
alter table public.monitored_links enable row level security;
alter table public.link_status_events enable row level security;
alter table public.guarantee_claims enable row level security;

drop policy if exists "buyers read their monitored links" on public.monitored_links;
create policy "buyers read their monitored links"
  on public.monitored_links for select
  using (buyer_id = auth.uid());

drop policy if exists "buyers read their link history" on public.link_status_events;
create policy "buyers read their link history"
  on public.link_status_events for select
  using (
    exists (
      select 1 from public.monitored_links l
      where l.id = link_id and l.buyer_id = auth.uid()
    )
  );

drop policy if exists "buyers read their claims" on public.guarantee_claims;
create policy "buyers read their claims"
  on public.guarantee_claims for select
  using (buyer_id = auth.uid());
