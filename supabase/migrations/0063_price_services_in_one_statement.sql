-- ---------------------------------------------------------------------------
-- 0063  Price every service in one statement
--
-- "Recalculate all prices" stopped finishing. It ran for about a minute and
-- the function was killed, leaving the inventory part priced: 3,479 of 4,954
-- services carried the new rules and 1,475 still carried the old ones.
--
-- The cost was never the arithmetic. It was the round trips:
--
--   service price writes   4,954 single-row UPDATEs, ten at a time   ~496
--   niche price upserts    20,440 rows, 500 at a time                  41
--   calculation upserts    20,440 rows, 500 at a time                  41
--
-- At about a hundred milliseconds each, the service writes alone are fifty
-- seconds. `pricing-service.ts` predicted this exactly - "nine hundred
-- listings is around two and a half thousand of these, and sequentially that
-- is over a minute of round trips ... long enough to be killed half way,
-- leaving the inventory part priced" - and the inventory has since roughly
-- doubled past the number that comment was written against.
--
-- The reason given there for writing them one at a time is wrong: "an upsert
-- on (website_id, type) would need a unique constraint that does not exist",
-- but 0001_init.sql:161 declares `unique (website_id, type)`.
--
-- The instinct behind it was still right, which is why this is a function and
-- not an upsert. A PostgREST upsert rewrites the whole row, so it would reset
-- `turnaround_min_days`, `turnaround_max_days` and `note` to their defaults on
-- every service it touched. This updates the three columns the caller means to
-- change and leaves the rest of the row alone.
--
-- `price_override = false` is kept here rather than trusted to the caller. A
-- hand-set price is somebody's decision and a bulk recalculation is not
-- allowed to quietly overwrite it, whoever is calling.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.pricing_apply_service_prices(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'pricing_apply_service_prices expects a JSON array';
  end if;

  update public.services s
     set price_minor = r.price_minor,
         agency_price_minor = r.agency_price_minor,
         -- A service approved from the publisher inbox is created priced at
         -- zero and unavailable: we know what it costs us, we do not know what
         -- we charge. This is the moment we know what we charge, so it becomes
         -- sellable. Without it a listing could be fully priced and still
         -- refuse to publish.
         available = true
    from jsonb_to_recordset(p_rows)
         as r(website_id uuid, service_type text, price_minor integer,
              agency_price_minor integer)
   where s.website_id = r.website_id
     and s.type = r.service_type::public.link_type
     and s.price_override = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

comment on function public.pricing_apply_service_prices(jsonb) is
  'Apply recalculated sell prices to every service in one statement. Updates price_minor, agency_price_minor and available only - turnaround and note are left alone, which an upsert would not do. Never touches a row with price_override = true.';

-- ---------------------------------------------------------------------------
-- Who may call it.
--
-- `security definer` runs past row level security and PostgREST publishes every
-- public function as an RPC endpoint, so without these an unauthenticated POST
-- could rewrite every sell price in the marketplace. Same convention as
-- 0057-0062.
-- ---------------------------------------------------------------------------

revoke all on function public.pricing_apply_service_prices(jsonb) from public;
revoke all on function public.pricing_apply_service_prices(jsonb) from anon;
revoke all on function public.pricing_apply_service_prices(jsonb) from authenticated;
