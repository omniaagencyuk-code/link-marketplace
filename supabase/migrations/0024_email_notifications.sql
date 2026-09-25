-- ---------------------------------------------------------------------------
-- Telling people things happened
--
-- Delivering a placement changed nothing a customer could see unless they
-- happened to log in. That is tolerable at five orders a week and indefensible
-- at fifty, and it is worse than it sounds: a placement approves itself after
-- fourteen days, so a customer who never knew it arrived can lose the right to
-- object to it.
--
-- Which makes the log below the important half of this migration. If an
-- auto-approval is ever disputed, "we told you on the third and again on the
-- eleventh" is the answer, and it has to be a row rather than a memory.
-- ---------------------------------------------------------------------------

-- The reminder goes once. Without somewhere to record that, a cron that runs
-- daily sends a customer the same warning every day for three days running.
alter table public.order_items
  add column if not exists reminder_sent_at timestamptz;

comment on column public.order_items.reminder_sent_at is
  'When we warned them the review window was closing. Null means we have not.';

-- --------------------------------------------------------------- email log --
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  -- Which of our messages this was, e.g. 'placement-delivered'. Not free text
  -- from a caller: it is what makes "did we send the reminder?" answerable.
  template text not null,
  to_address text not null,
  subject text not null,
  -- What the order was about, where there was one. Kept nullable because not
  -- every message we will ever send belongs to an order.
  order_id uuid references public.orders (id) on delete set null,
  order_item_id uuid references public.order_items (id) on delete set null,
  sent_at timestamptz not null default timezone('utc', now()),
  -- The provider's id for it, so a message can be traced in their dashboard.
  provider_id text,
  -- Null on success. A failed send is recorded rather than thrown away: the
  -- question "why did they never hear from us" has to have an answer.
  error text
);

comment on table public.email_log is
  'Every message we sent, and every one we failed to. Internal - no customer policy exists.';

create index if not exists email_log_sent_idx on public.email_log (sent_at desc);
create index if not exists email_log_item_idx on public.email_log (order_item_id, template);

alter table public.email_log enable row level security;

-- Admin only, deliberately. A customer's own address is in there, but so is
-- every other customer's, and there is no version of this a customer needs.
do $$
begin
  create policy "Admins read the email log"
    on public.email_log for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------------------------------- settings --
-- How many days before the deadline to warn them. A setting because it is a
-- judgement about how much mail is fair, not a constant.
alter table public.settings
  add column if not exists approval_reminder_days smallint not null default 3
    check (approval_reminder_days >= 0);
