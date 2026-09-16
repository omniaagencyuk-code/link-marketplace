-- ---------------------------------------------------------------------------
-- Taking payment, and remembering what happened
--
-- Until now there was no way to place an order at all: the basket lived in the
-- browser and the order service could read orders but not create one.
--
-- Three additions:
--
--   1. Payment state on the order, kept separate from fulfilment state. An
--      order that is paid but not yet published is a normal thing, and
--      collapsing the two into one enum makes that impossible to express.
--
--   2. order_status_history, because a status that is overwritten loses the
--      answer to "when did this go live?" - the question customers actually
--      ask.
--
--   3. stripe_events, so a webhook Stripe delivers twice is only acted on
--      once. Stripe guarantees at-least-once delivery, so this is required
--      rather than defensive.
-- ---------------------------------------------------------------------------

create type public.payment_status as enum (
  'unpaid',
  -- Checkout opened; the customer may still abandon it.
  'processing',
  'paid',
  'refunded',
  'failed'
);

alter table public.orders
  add column if not exists payment_status public.payment_status not null default 'unpaid',
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists paid_at timestamptz;

-- Looking an order up by its checkout session is how the webhook finds it.
create unique index if not exists orders_stripe_session_idx
  on public.orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists orders_payment_status_idx on public.orders (payment_status);

-- ------------------------------------------------------------ status history
create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  -- Free text shown to the customer on the order timeline, e.g. which
  -- publisher confirmed. Optional.
  note text,
  -- Who moved it. Null for changes the system made, such as a payment
  -- webhook, which is a meaningful distinction on a timeline.
  changed_by text,
  created_at timestamptz not null default timezone('utc', now())
);

create index order_status_history_order_idx
  on public.order_status_history (order_id, created_at desc);

-- -------------------------------------------------------------- stripe events
create table public.stripe_events (
  -- Stripe's own event id. Being the primary key is what makes replay safe:
  -- the second delivery of an event conflicts and is ignored.
  id text primary key,
  type text not null,
  received_at timestamptz not null default timezone('utc', now())
);

-- --------------------------------------------------------------------- RLS --
alter table public.order_status_history enable row level security;
alter table public.stripe_events enable row level security;

-- A customer can see the history of their own orders, and nobody else's.
create policy "Users read their own order history"
  on public.order_status_history for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_status_history.order_id
        and (orders.user_id = auth.uid() or public.is_admin())
    )
  );

create policy "Admins manage order history"
  on public.order_status_history for all
  using (public.is_admin()) with check (public.is_admin());

-- No policy for anyone but an admin: the event log is ours, and a customer
-- has no reason to read Stripe's delivery record.
create policy "Admins read stripe events"
  on public.stripe_events for select
  using (public.is_admin());

/**
 * Move an order to a new status and record it in one step.
 *
 * Doing both in one statement is the point: a status set without a history
 * row, or a history row without the status changing, are both worse than
 * either being absent. Called by the webhook and by the admin.
 */
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_changed_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
     set status = p_status, updated_at = timezone('utc', now())
   where id = p_order_id;

  if not found then
    raise exception 'Order % does not exist', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_status, p_note, p_changed_by);
end;
$$;

revoke all on function public.set_order_status(uuid, public.order_status, text, text) from public;
