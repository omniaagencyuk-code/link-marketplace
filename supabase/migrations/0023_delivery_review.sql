-- ---------------------------------------------------------------------------
-- Handing a finished placement back to the customer
--
-- Until now an order ended when we said it was live. Nobody asked the person
-- who paid whether what arrived was what they bought, and `live_url` was a
-- column the app could read but nothing could write: the one fact a customer
-- most wants had no way in.
--
-- Two separate questions, deliberately two separate columns. `status` is
-- where the work got to and is ours to set. `approval` is what the customer
-- made of it and is theirs. Collapsing them would mean either a customer who
-- can move an order through our workflow, or a workflow that cannot record a
-- complaint without pretending the work went backwards.
-- ---------------------------------------------------------------------------

-- All of it or none of it.
--
-- Wrapped in an explicit transaction because this is applied by hand: a run
-- that stops halfway leaves columns that exist, columns that do not, and no
-- way to tell which from looking at the file. Rolling back to where it
-- started is always recoverable; a half-migrated orders table is not.
begin;

-- ---------------------------------------------------------------- approval --
-- Wrapped because `create type` has no "if not exists", and it is the only
-- statement in this file that cannot be run twice. A migration that half
-- applies and then refuses to be re-run leaves whoever is holding it with
-- nothing to do but edit it by hand.
--
-- 'pending'      delivered and waiting on the customer. Also the state of
--                everything not delivered yet, which `delivered_at`
--                distinguishes: work not finished is not work awaiting
--                approval.
-- 'approved'     they are happy, or the clock ran out. `auto_approved` says
--                which.
-- 'issue-raised' they have told us something is wrong. The open row in
--                `order_item_issues` says what.
do $$
begin
  create type public.item_approval as enum ('pending', 'approved', 'issue-raised');
exception
  when duplicate_object then null;
end;
$$;

alter table public.order_items
  add column if not exists approval public.item_approval not null default 'pending';

-- When we handed it over, which starts the clock. Null means not delivered.
alter table public.order_items
  add column if not exists delivered_at timestamptz;

alter table public.order_items
  add column if not exists approved_at timestamptz;

-- Stored per item rather than worked out from a constant at read time, so
-- changing the default window never moves a deadline a customer has already
-- been shown. The date on their screen is the date in the row.
alter table public.order_items
  add column if not exists auto_approve_at timestamptz;

-- True only where nobody pressed the button. Kept because "they were happy"
-- and "they did not reply" are different facts, and only one of them is
-- worth anything if a placement is ever disputed.
alter table public.order_items
  add column if not exists auto_approved boolean not null default false;

comment on column public.order_items.approval is
  'What the customer made of the delivery. Theirs to set, not ours.';
comment on column public.order_items.auto_approved is
  'Approved by the clock rather than by the customer. Not the same as consent.';

create index if not exists order_items_awaiting_approval_idx
  on public.order_items (auto_approve_at)
  where approval = 'pending' and delivered_at is not null;

-- ------------------------------------------------------------ order close --
-- A timestamp rather than a new value on `order_status`, because an enum
-- cannot have a value removed again and every schema change here has to be
-- reversible. "Complete" is rendered from this.
alter table public.orders
  add column if not exists completed_at timestamptz;

comment on column public.orders.completed_at is
  'Set once every item on the order is approved. Rendered as "Complete".';

-- ---------------------------------------------------------------- issues --
-- What the customer says is wrong, in their words, kept as a thread rather
-- than a field: a placement can go wrong twice, and the second complaint must
-- not overwrite the first.
create table if not exists public.order_item_issues (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  raised_by uuid references public.profiles (id) on delete set null,
  -- Their description of the problem. Required: an issue with no words is a
  -- support ticket nobody can act on.
  message text not null check (length(trim(message)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by text,
  -- What we did about it, shown back to the customer.
  resolution_note text
);

create index if not exists order_item_issues_item_idx
  on public.order_item_issues (order_item_id, created_at desc);

create index if not exists order_item_issues_open_idx
  on public.order_item_issues (created_at desc) where resolved_at is null;

alter table public.order_item_issues enable row level security;

-- The customer may read and raise issues on their own order, and nothing
-- else. Membership is proved through the order rather than trusted from the
-- request, so a guessed item id belonging to somebody else matches no row.
do $$
begin
  create policy "Customers read their own issues"
    on public.order_item_issues for select
    using (
      exists (
        select 1
        from public.order_items
        join public.orders on orders.id = order_items.order_id
        where order_items.id = order_item_issues.order_item_id
          and orders.user_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Customers raise issues on their own order"
    on public.order_item_issues for insert
    with check (
      raised_by = auth.uid()
      and exists (
        select 1
        from public.order_items
        join public.orders on orders.id = order_items.order_id
        where order_items.id = order_item_issues.order_item_id
          and orders.user_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end;
$$;

-- Deliberately no update or delete policy for a customer: a complaint they
-- can edit after we have acted on it is not a record of anything.
do $$
begin
  create policy "Admins manage issues"
    on public.order_item_issues for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

-- ------------------------------------------------------- the review window --
-- A setting rather than a constant, because the fair length of it is a
-- commercial decision and one that will be argued about.
alter table public.settings
  add column if not exists delivery_auto_approve_days smallint not null default 14
    check (delivery_auto_approve_days > 0);

-- How long after approving a customer may still report a problem. Links get
-- pulled after publication, and that is exactly when we want to hear.
alter table public.settings
  add column if not exists post_approval_issue_days smallint not null default 30
    check (post_approval_issue_days >= 0);

commit;
