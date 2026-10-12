-- ---------------------------------------------------------------------------
-- 0081  The Link Building Planner
--
-- Somewhere for a customer to plan, organise and track backlinks - the ones
-- they buy here and the ones they buy anywhere else. It replaces a
-- spreadsheet, so the shape below is the shape of a spreadsheet somebody has
-- already been keeping: a row per link, every field editable, nothing
-- required except enough to know what the row is about.
--
-- Schema and policies only. No page reads or writes any of this yet.
--
-- ## What it reuses, and the one thing it deliberately does not
--
-- `gap_projects` is the project. It already means "a site a customer runs
-- reports on - their own or a client's", it already belongs to its owner by
-- a policy scoped to `user_id` on both halves, and the marketplace's own
-- projects panel already reads it. A second projects table would be two
-- lists of the same sites, drifting apart at the first edit, with no way for
-- the customer to tell which list a given screen is reading. So the planner's
-- project settings are four columns on the table that already exists. The
-- name stays `gap_projects` because renaming a live table to improve a noun
-- is not worth one minute of downtime.
--
-- Rate limiting reuses `consume_rate_limit` from 0009. It is already a
-- Postgres counter keyed by bucket with a window, incremented inside one
-- statement so two concurrent calls cannot both pass - which is exactly what
-- the metric lookup needs, and a second one would be a second thing to get
-- the concurrency wrong in.
--
-- What it does not reuse is `gap_projects`' admin policy. See the note above
-- the policies.
--
-- ## Blank is not zero, again
--
-- Every metric, price and date here is nullable. A customer who has not
-- looked up a domain rating has not recorded a domain rating of zero, and a
-- planner that stores the second thing will report a portfolio average that
-- is wrong and a budget that is understated. `websites.organic_keywords` was
-- made nullable in 0050 for the same reason and says so.
--
-- ## Nothing here checks a link
--
-- There is no crawl state, no last-verified column and no job table,
-- because there is no crawling. A link is Live because a person said so and
-- typed the date. Storing a `verified_at` would be the first half of a
-- feature the brief forbids, and the second half always follows.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

-- -------------------------------------------------- the project, extended

/*
  Defaults, which a month may override. Nullable rather than zero: a project
  with no budget set is not a project with a budget of nothing, and the
  difference decides whether the overview draws a percentage or just counts.
*/
alter table public.gap_projects
  add column if not exists monthly_budget_minor integer
    check (monthly_budget_minor is null or monthly_budget_minor >= 0);

alter table public.gap_projects
  add column if not exists monthly_link_target integer
    check (monthly_link_target is null or monthly_link_target >= 0);

/*
  The project's own currency, which is what its summaries are totalled in.

  Links may be bought in anything; the overview adds up only the ones
  matching this and lists the rest separately. That is a deliberate refusal
  to convert: a rate fetched today applied to an invoice paid in March is a
  number that looks precise and is not, and no exchange-rate service is
  worth adding to a free tool.
*/
alter table public.gap_projects
  add column if not exists currency char(3) not null default 'GBP';

alter table public.gap_projects
  add column if not exists notes text not null default '';

/*
  Archived, not deleted. A finished client campaign is a record somebody may
  need next year, and `on delete cascade` from here reaches every link in it.
*/
alter table public.gap_projects
  add column if not exists archived_at timestamptz;

comment on column public.gap_projects.monthly_budget_minor is
  'Default monthly budget for the planner, in minor units of the project currency. Null means none set, which is not the same as zero - the overview shows counts without a percentage.';
comment on column public.gap_projects.currency is
  'What this project''s planner summaries are totalled in. Links priced in anything else are listed apart rather than converted; there is no exchange-rate source here and a made-up rate is worse than an honest split.';

-- ------------------------------------------------------ a month of a plan

/*
  One row per project per month, and only when the month differs from the
  project's defaults.

  A row is an override, not a requirement: a project with twelve months of
  planned links and no row here is running on its defaults, which is the
  common case and costs nothing to store.

  `month` is a date pinned to the first, enforced rather than trusted. Two
  rows for October - one on the 1st and one on the 15th - is a budget that
  silently splits in two, and the unique constraint below cannot see it.
*/
create table if not exists public.planner_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.gap_projects (id) on delete cascade,

  month date not null,

  budget_minor integer check (budget_minor is null or budget_minor >= 0),
  link_target integer check (link_target is null or link_target >= 0),

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint planner_months_first_of_month check (date_trunc('month', month) = month),
  unique (project_id, month)
);

create index if not exists planner_months_user_idx on public.planner_months (user_id, month desc);

-- ------------------------------------------------------------- a status

/*
  Statuses belong to the customer, not to the product.

  An agency's pipeline has steps ours has never heard of - "waiting for
  content", "client approval required", "invoice paid" - and a fixed enum
  makes those live in the notes field where nothing can count them.

  `category` is what keeps the dashboard working anyway. A custom status
  reports as one of seven things, so "Awaiting publisher" counts toward In
  Progress without the overview needing to know the name. Without it every
  chart would have to ignore custom statuses, which is to say ignore the
  statuses the customer actually uses.
*/
create table if not exists public.planner_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,

  name text not null check (length(btrim(name)) between 1 and 40),

  /* A hex colour the customer picked, validated so a stylesheet cannot be
     smuggled into one. */
  colour text not null default '#64748b' check (colour ~ '^#[0-9a-fA-F]{6}$'),

  category text not null check (
    category in ('planned', 'in_progress', 'scheduled', 'waiting', 'live', 'lost', 'cancelled')
  ),

  sort_order integer not null default 0,

  /* Archived rather than deleted when it is still on links - see the
     restrict on `planner_links.status_id`. An archived status disappears
     from the dropdown and keeps describing the rows that already carry it. */
  archived_at timestamptz,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  unique (user_id, name)
);

create index if not exists planner_statuses_user_idx
  on public.planner_statuses (user_id, sort_order)
  where archived_at is null;

-- ------------------------------------------------------------- a source

/*
  Where a link came from, when it did not come from a list we wrote.

  The defaults - Press Parrot, Other Marketplace, Direct Publisher, Outreach,
  Manual - live in the application, because they are the same for everybody
  and a row per user per default is five thousand rows saying nothing. This
  table is only what a customer added: their own suppliers, by name.

  Which is commercially sensitive, and is why nothing outside this customer
  can read it. An agency's supplier list is the thing they would least like
  the marketplace they buy from to have.
*/
create table if not exists public.planner_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, name)
);

-- --------------------------------------------------------------- a link

create table if not exists public.planner_links (
  id uuid primary key default gen_random_uuid(),

  /*
    Carried on the row as well as reachable through the project.

    The policy below is `user_id = auth.uid()`, one index lookup, with no
    join to a second table whose own policy would also have to be evaluated.
    It is denormalised and the trigger below is what stops it drifting.
  */
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.gap_projects (id) on delete cascade,

  /* Which month this was planned into. Not where it ended up: a link planned
     for October and published in November stays an October row, because the
     plan is what the month is reporting on. */
  plan_month date not null,

  /* As the customer typed it, kept so their spreadsheet reads back the way
     they wrote it. */
  domain text not null check (length(btrim(domain)) between 1 and 253),

  /*
    And the same thing normalised, which is what matching uses.

    Written by the application rather than derived here: the rules - drop the
    scheme, drop a leading `www.`, drop the path and the query, lowercase -
    are easy to state and fiddly in SQL, and getting two implementations to
    agree is how a lookup starts missing. What matters at this level is that
    the two are separate columns, so normalising harder later does not lose
    what anybody typed.

    Subdomains survive. `news.example.com` is not `example.com`, and a
    planner that merges them reports a link on the wrong site.
  */
  domain_key text not null check (length(btrim(domain_key)) between 1 and 253),

  /* Free text, from the application's defaults or from `planner_sources`.
     A foreign key would mean a row per default per user, and renaming a
     supplier would rewrite history that was true at the time. */
  source text not null default '',

  /*
    Metrics. All nullable, and that is the whole point: blank is unknown and
    zero is a measurement. A planner that defaults these to zero reports an
    average domain rating that drops every time somebody adds a row.
  */
  domain_rating smallint check (domain_rating is null or domain_rating between 0 and 100),
  organic_traffic integer check (organic_traffic is null or organic_traffic >= 0),
  organic_keywords integer check (organic_keywords is null or organic_keywords >= 0),
  referring_domains integer check (referring_domains is null or referring_domains >= 0),

  /* Where those four came from, so a customer can tell a figure they typed
     from one we gave them, and how old ours was. Nothing here is a claim
     that a manually entered number is verified. */
  metrics_source text check (metrics_source is null or metrics_source in ('manual', 'csv', 'press-parrot')),
  metrics_updated_at timestamptz,

  link_type text not null default '',
  target_url text,
  anchor_text text not null default '',
  anchor_type text not null default '',

  /*
    `restrict`, not `cascade` or `set null`.

    Deleting a status that rows still carry would either delete the rows or
    quietly blank them, and both lose work. The database refuses, and the
    application offers to reassign or archive instead - which is the brief's
    rule enforced where it cannot be forgotten rather than in whichever
    code path happens to call the delete.
  */
  status_id uuid not null references public.planner_statuses (id) on delete restrict,

  planned_date date,
  live_date date,
  live_url text,

  /* Blank by default. A link can be planned before anybody has agreed a
     price, and a zero here would be counted as a free placement. */
  price_minor integer check (price_minor is null or price_minor >= 0),
  currency char(3),

  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid')),
  paid_minor integer check (paid_minor is null or paid_minor >= 0),

  notes text not null default '',

  /*
    The order item this row came from, when it came from one.

    A reference, not a copy of its state: the planner is an organisational
    tool laid over the order book, and the arrow points one way. Changing a
    planner status must not move a real order, and changing a planner price
    must not change what somebody paid. `set null` because deleting an order
    item should orphan the planner row, not delete the customer's plan.
  */
  order_item_id uuid references public.order_items (id) on delete set null,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint planner_links_first_of_month check (date_trunc('month', plan_month) = plan_month),

  /* Partially paid with no amount is not a payment state anybody can report
     on; paid-in-full needs no second figure. */
  constraint planner_links_partial_needs_amount
    check (payment_status <> 'partially_paid' or paid_minor is not null)
);

/* The planner's own screen: one project, one month, newest first. */
create index if not exists planner_links_project_month_idx
  on public.planner_links (project_id, plan_month, created_at desc);

/* Every policy below starts here, so it is worth its own index. */
create index if not exists planner_links_user_idx on public.planner_links (user_id);

/* "Is this domain already in my plan?", and the duplicate check on import. */
create index if not exists planner_links_domain_key_idx
  on public.planner_links (user_id, domain_key);

/* Finding the rows already imported from orders, so importing twice does
   not make two of each. */
create index if not exists planner_links_order_item_idx
  on public.planner_links (order_item_id)
  where order_item_id is not null;

create index if not exists planner_links_status_idx on public.planner_links (status_id);

-- -------------------------------------------------------------- triggers

do $$
begin
  create trigger planner_months_set_updated_at
    before update on public.planner_months
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger planner_statuses_set_updated_at
    before update on public.planner_statuses
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger planner_links_set_updated_at
    before update on public.planner_links
    for each row execute function public.set_updated_at();
exception when duplicate_object then null;
end;
$$;

/*
  A link, its project and its status all belong to the same person.

  Without this, a customer could file one of their links under somebody
  else's project id, or wear somebody else's status - both of which pass the
  row's own policy, because the policy only looks at `user_id`, and the
  `user_id` on the row would be their own. The leak is not the row: it is
  that the owner of that project would then see a row they did not create,
  and the foreign key would hold it there.

  Enforced in the database because it is a cross-row invariant, and those
  are exactly the ones application code forgets on the second write path.
*/
create or replace function public.planner_links_same_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_owner uuid;
  v_status_owner uuid;
begin
  select user_id into v_project_owner from public.gap_projects where id = new.project_id;
  if v_project_owner is distinct from new.user_id then
    raise exception 'A planner link must belong to its own project';
  end if;

  select user_id into v_status_owner from public.planner_statuses where id = new.status_id;
  if v_status_owner is distinct from new.user_id then
    raise exception 'A planner link must use one of its owner''s statuses';
  end if;

  return new;
end;
$$;

do $$
begin
  create trigger planner_links_same_owner_check
    before insert or update of project_id, status_id, user_id on public.planner_links
    for each row execute function public.planner_links_same_owner();
exception when duplicate_object then null;
end;
$$;

-- The same invariant for a month: a month override belongs to its project.
create or replace function public.planner_months_same_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from public.gap_projects where id = new.project_id;
  if v_owner is distinct from new.user_id then
    raise exception 'A planner month must belong to its own project';
  end if;
  return new;
end;
$$;

do $$
begin
  create trigger planner_months_same_owner_check
    before insert or update of project_id, user_id on public.planner_months
    for each row execute function public.planner_months_same_owner();
exception when duplicate_object then null;
end;
$$;

-- -------------------------------------------------------- the statuses seed

/*
  The eleven defaults, given to a customer the first time they open the
  planner.

  Rows rather than an enum, because the whole point is that they can be
  renamed, recoloured, reordered and retired. Given once per customer rather
  than shipped as a global list, because a global list cannot be edited by
  one person without editing it for everybody.

  Idempotent on the customer having none: a customer who has deleted every
  status has chosen to, and running this again would hand them all back.
*/
create or replace function public.planner_seed_statuses(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing integer;
begin
  select count(*) into v_existing from public.planner_statuses where user_id = p_user_id;
  if v_existing > 0 then return 0; end if;

  insert into public.planner_statuses (user_id, name, colour, category, sort_order)
  values
    (p_user_id, 'Planned',           '#64748b', 'planned',     10),
    (p_user_id, 'Outreach Sent',     '#64748b', 'in_progress', 20),
    (p_user_id, 'Awaiting Response', '#64748b', 'in_progress', 30),
    (p_user_id, 'Approved',          '#2563eb', 'in_progress', 40),
    (p_user_id, 'Ordered',           '#2563eb', 'in_progress', 50),
    (p_user_id, 'In Progress',       '#2563eb', 'in_progress', 60),
    (p_user_id, 'Scheduled',         '#7c3aed', 'scheduled',   70),
    (p_user_id, 'Waiting to Go Live','#d97706', 'waiting',     80),
    (p_user_id, 'Live',              '#059669', 'live',        90),
    (p_user_id, 'Lost',              '#dc2626', 'lost',       100),
    (p_user_id, 'Cancelled',         '#8595a6', 'cancelled',  110);

  return 11;
end;
$$;

comment on function public.planner_seed_statuses(uuid) is
  'Give a customer the default planner statuses, once. Does nothing if they already have any, because a customer who deleted them chose to.';

revoke all on function public.planner_seed_statuses(uuid) from public;
revoke all on function public.planner_seed_statuses(uuid) from anon;
revoke all on function public.planner_seed_statuses(uuid) from authenticated;

-- ------------------------------------------------------------- the policies

alter table public.planner_months enable row level security;
alter table public.planner_statuses enable row level security;
alter table public.planner_sources enable row level security;
alter table public.planner_links enable row level security;

/*
  The customer's own, and nobody else's - including ours.

  `gap_projects` carries an admin policy alongside its customer one. These
  four deliberately do not, and the difference is what is in them. A gap
  project is a domain and a list of competitors. A planner holds an agency's
  supplier names, what they pay those suppliers, which clients they work for,
  what they are bidding on and their private notes about all of it - which is
  the single most commercially sensitive thing a customer of a link
  marketplace could hand the marketplace.
  
  An ambient admin grant over that is a standing invitation to use it: to
  price against it, to recruit the publishers in it, to see what a customer
  pays elsewhere. Support can still reach a row with the service role, which
  bypasses row security - the difference is that doing so is a deliberate act
  by somebody who had to go and get the key, rather than a column a query
  wanders into.

  `using` *and* `with check` on every one. Without the second half a customer
  can hand their row to somebody else by writing another `user_id` into it -
  which is the hole AGENTS.md records for `gap_projects` and the reason it
  says so twice.
*/
do $$
begin
  create policy "Customers manage their own planner months"
    on public.planner_months for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers manage their own planner statuses"
    on public.planner_statuses for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers manage their own planner sources"
    on public.planner_sources for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers manage their own planner links"
    on public.planner_links for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());
exception when duplicate_object then null;
end;
$$;

comment on table public.planner_links is
  'A customer''s link-building plan: one row per link, bought anywhere. Confidential - supplier names, what they paid and which clients they work for. Customer-only policy, no admin policy, on purpose.';
comment on table public.planner_sources is
  'Suppliers and platforms a customer named themselves. Their list, not ours, and never readable by us through a policy.';
