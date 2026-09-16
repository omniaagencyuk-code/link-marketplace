-- ---------------------------------------------------------------------------
-- Rate limiting for authentication endpoints
--
-- Sign-in, sign-up and password reset were unthrottled: an attacker could
-- try passwords as fast as the network allowed.
--
-- This lives in Postgres rather than in process memory because the app runs
-- on serverless instances. An in-memory counter is per-instance, so an
-- attacker spreading requests across instances would never reach the limit -
-- it would look like protection while providing very little.
--
-- The counter is incremented inside a single statement so two concurrent
-- attempts cannot both read the same count and both be allowed.
-- ---------------------------------------------------------------------------

create table public.rate_limits (
  -- "action:identifier", e.g. "sign-in:203.0.113.4".
  bucket text primary key,
  count integer not null default 0,
  -- When the current window closes. A row past this is treated as empty and
  -- reset on the next attempt, so no cleanup job is required for correctness.
  expires_at timestamptz not null
);

create index rate_limits_expires_idx on public.rate_limits (expires_at);

alter table public.rate_limits enable row level security;

-- No policy for anon or authenticated: the table is written only through the
-- function below, which runs as its owner. Nobody can read another visitor's
-- attempt counts, and nobody can clear their own.
create policy "Admins read rate limits"
  on public.rate_limits for select
  using (public.is_admin());

/**
 * Record an attempt and say whether it is allowed.
 *
 * Returns the number of seconds the caller must wait, or 0 when the attempt
 * may proceed. One statement does the read, the reset-if-expired, the
 * increment and the decision, so concurrent calls cannot race past the limit.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
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
  v_count integer;
  v_expires timestamptz;
begin
  insert into public.rate_limits (bucket, count, expires_at)
  values (p_bucket, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set
      -- An expired window starts again at one rather than continuing to climb.
      count = case
        when public.rate_limits.expires_at <= v_now then 1
        else public.rate_limits.count + 1
      end,
      expires_at = case
        when public.rate_limits.expires_at <= v_now
          then v_now + make_interval(secs => p_window_seconds)
        else public.rate_limits.expires_at
      end
  returning count, expires_at into v_count, v_expires;

  if v_count > p_max then
    return greatest(1, ceil(extract(epoch from (v_expires - v_now)))::integer);
  end if;

  return 0;
end;
$$;

/** Housekeeping. Correctness does not depend on it; table size does. */
create or replace function public.prune_rate_limits()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where expires_at <= timezone('utc', now()) - interval '1 day';
$$;
