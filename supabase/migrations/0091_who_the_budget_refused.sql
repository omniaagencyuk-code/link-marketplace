-- ---------------------------------------------------------------------------
-- Who the budget refused
--
-- 0090 gave every account an hourly ceiling on how much of the inventory it
-- may be served, and refuses past it with "try again shortly". That refusal
-- is invisible: `rate_limits` holds a live counter that resets when the
-- window rolls, so a customer who was stopped at two in the afternoon leaves
-- no trace by three, and the first anybody here hears of it is a support
-- email nobody can check.
--
-- Two things follow from that, and only one of them is about scraping:
--
--   * **Support cannot answer.** "The marketplace told me to come back
--     later" is unanswerable without a record of whether we said it.
--   * **The number cannot be tuned.** Two thousand rows an hour was an
--     argument, not a measurement. Whether it is right is a question about
--     who meets it, and nothing was recording that.
--
-- ## A row per refusal, not per read
--
-- A read is every marketplace page view; a row apiece would be an analytics
-- table with a guard's name on it. A refusal is rare by design - an account
-- has to ask for a sixth of the inventory in an hour to see one - so this
-- table stays small while answering both questions above.
--
-- Nothing prunes it yet, as nothing prunes `rate_limits`. If it ever grows
-- enough to matter, the sweep belongs beside the others in /api/cron, and
-- the admin panel prints the row count so that it is noticed rather than
-- discovered.
--
-- ## Internal, on the terms every other internal table has
--
-- What it holds is which customer asked for too much and when, which is a
-- judgement about them: `prospect_contacts`-grade rather than inventory. It
-- gets an admin policy and no customer-facing policy at all.
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_refusals (
  id uuid primary key default gen_random_uuid(),
  /*
    The bucket, verbatim, rather than a user id column.

    `spend_inventory_budget` is handed `inventory-rows:<uuid>` and nothing
    else, and keeping its signature is what makes this migration safe to run
    before the deploy as well as after: the function the live code calls has
    the same four arguments it had this morning. The admin read splits the
    uuid back out; a bucket that ever stops carrying one shows as unknown
    rather than failing.
  */
  bucket text not null,
  /** What the refused read would have cost, which is how a scraper shows. */
  rows_asked integer not null,
  refused_at timestamptz not null default timezone('utc', now())
);

create index if not exists inventory_refusals_when_idx
  on public.inventory_refusals (refused_at desc);

alter table public.inventory_refusals enable row level security;

do $$ begin
  create policy "Admins read refusals" on public.inventory_refusals
    for select using (public.is_admin());
exception when duplicate_object then null; end; $$;

comment on table public.inventory_refusals is
  'One row each time spend_inventory_budget refused a read. Internal: it says which customer asked for too much and when. Admin policy only, no customer-facing policy.';

-- ---------------------------------------------------------------------------
-- The function records its own refusals
--
-- Inside the function rather than in the caller, for the reason the spending
-- is: a record that depends on every future caller remembering it is not a
-- record. It is the same argument `outbound_emails` makes with its trigger.
--
-- Same four arguments as 0090 - deliberately. The deployed code calls this by
-- name, so replacing the body changes what happens without changing what is
-- called, and this migration is safe to run before its deploy or after.
-- ---------------------------------------------------------------------------
create or replace function public.spend_inventory_budget(
  p_bucket text,
  p_rows integer,
  p_max integer,
  p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_cost integer := greatest(0, coalesce(p_rows, 0));
  v_count integer;
  v_expires timestamptz;
begin
  insert into public.rate_limits (bucket, count, expires_at)
  values (p_bucket, v_cost, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set
      count = case
        when public.rate_limits.expires_at <= v_now then v_cost
        else public.rate_limits.count + v_cost
      end,
      expires_at = case
        when public.rate_limits.expires_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.rate_limits.expires_at
      end
  returning count, expires_at into v_count, v_expires;

  if v_count > p_max then
    /*
      Recorded before the refusal is returned, so the two cannot disagree.

      A refused read still spent its rows above - that is 0090's rule, and
      it is why a budget cannot be walked by asking for pages that fail -
      so this row is the only place the event survives the window rolling.
    */
    insert into public.inventory_refusals (bucket, rows_asked)
    values (p_bucket, v_cost);

    return greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer);
  end if;

  return 0;
end;
$$;

comment on function public.spend_inventory_budget(text, integer, integer, integer) is
  'Spend a number of inventory rows against an account''s hourly budget. Returns 0 when the read may proceed, or the seconds until the window resets, recording the refusal in inventory_refusals. Shares the rate_limits table with consume_rate_limit; the unit is rows rather than attempts.';

revoke all on function public.spend_inventory_budget(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.spend_inventory_budget(text, integer, integer, integer) to service_role;
