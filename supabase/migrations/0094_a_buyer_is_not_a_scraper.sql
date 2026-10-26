-- ---------------------------------------------------------------------------
-- A buyer is not a scraper
--
-- 0090 gave every account an hourly ceiling on how much of the inventory it
-- may be served, and 0091 recorded who it refused. The ceiling worked, and
-- the first person it stopped was one of ours - which is the failure the
-- budget's own note predicted: "a limit that a real customer meets is a
-- limit that gets raised until it means nothing."
--
-- Three changes, and only this one needs the database. The other two - the
-- ceiling tripled, and an administrator never charged at all - are a
-- constant and a session check in `src/lib/marketplace/budget.ts`.
--
-- ## Clearing a bucket, and why the table still refuses to let anybody do it
--
-- The third change is that putting something in the basket clears the
-- account's spend: somebody choosing what to buy is the customer this
-- marketplace is for, and the one person the guard should never be pointed
-- at.
--
-- 0009 says of `rate_limits` that "nobody can clear their own", and that is
-- still true of the table: no policy, no grant, and this function is
-- `security definer` with execute revoked from `anon` and `authenticated`
-- exactly as `spend_inventory_budget` is. The clearing is done by our server
-- under the service role after it has checked the session, never by a
-- browser holding a customer's token. What changed is what our server will
-- do on the customer's behalf, not who may reach the table.
--
-- ## It clears, rather than crediting back
--
-- Deleting the row starts the next window at nothing, which is a larger
-- grant than refunding a page would be. That is the intent: the question
-- this answers is "is this person buying?", and the answer is not worth
-- expressing in rows. A refund would also need to know what to refund, and
-- nothing records what any one read cost.
--
-- It takes a bucket rather than an account id, because the bucket is what
-- `rate_limits` is keyed by and the caller already builds one. Narrowed to
-- the inventory prefix so this cannot be turned into a way to clear a
-- sign-in throttle: that counter protects the front door, and nothing on a
-- customer's happy path should be able to reach it.
-- ---------------------------------------------------------------------------

create or replace function public.clear_inventory_budget(p_bucket text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cleared integer;
begin
  -- The prefix check is the whole of this function's authority. Without it
  -- the argument names any counter in the table.
  if p_bucket is null or p_bucket not like 'inventory-rows:%' then
    return false;
  end if;

  delete from public.rate_limits where bucket = p_bucket;
  get diagnostics v_cleared = row_count;
  return v_cleared > 0;
end;
$$;

comment on function public.clear_inventory_budget(text) is
  'Clear one account''s inventory-rows counter, so its next window starts at nothing. Refuses any bucket outside the inventory-rows prefix, so it cannot reach a sign-in throttle. Called by our server when a customer adds a listing to their basket.';

revoke all on function public.clear_inventory_budget(text) from public, anon, authenticated;
grant execute on function public.clear_inventory_budget(text) to service_role;
