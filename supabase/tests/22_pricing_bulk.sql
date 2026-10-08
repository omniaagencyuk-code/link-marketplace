\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Pricing every service in one statement.
--
-- The thing this replaces wrote one row at a time, which against 4,954
-- services was 496 sequential waves - long enough to be killed part way, which
-- is what happened: 3,479 services on the new rules and 1,475 on the old.
--
-- A set-based write is faster but has two ways to be wrong that the per-row
-- version did not, and both are silent:
--
--   * it could overwrite a hand-set price, and
--   * done as an upsert it would rewrite the whole row, resetting turnaround
--     and note to their defaults on every service it touched.
--
-- Most of what follows is about those two.
-- ---------------------------------------------------------------------------

-- `websites_country_needs_a_source` (0044) requires both or neither.
insert into public.websites
  (slug, domain, title, status, country_code, country_source, language_code)
values ('bulk-price-test', 'bulk-price.test', 'Bulk price test', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

-- Three services on one listing: one ordinary, one hand-priced, one that the
-- publisher inbox created at zero and unavailable.
insert into public.services
  (website_id, type, price_minor, turnaround_min_days, turnaround_max_days, note, available, price_override)
select id, 'guest-post', 10000, 3, 9, 'keep me', true, false
from public.websites where slug = 'bulk-price-test'
on conflict (website_id, type) do nothing;

insert into public.services
  (website_id, type, price_minor, turnaround_min_days, turnaround_max_days, note, available, price_override)
select id, 'niche-edit', 25000, 2, 4, 'hand set', true, true
from public.websites where slug = 'bulk-price-test'
on conflict (website_id, type) do nothing;

insert into public.services
  (website_id, type, price_minor, turnaround_min_days, turnaround_max_days, note, available, price_override)
select id, 'digital-pr', 0, 1, 5, null, false, false
from public.websites where slug = 'bulk-price-test'
on conflict (website_id, type) do nothing;

select 'the write reports how many rows it changed: ' ||
  (select public.pricing_apply_service_prices(
     (select jsonb_agg(jsonb_build_object(
        'website_id', w.id,
        'service_type', t.service_type,
        'price_minor', t.price_minor,
        'agency_price_minor', t.agency_price_minor))
      from public.websites w,
           (values ('guest-post', 19500, 17550),
                   ('niche-edit', 99999, 99999),
                   ('digital-pr', 12000, 10800))
             as t(service_type, price_minor, agency_price_minor)
      where w.slug = 'bulk-price-test')) = 2);

select 'an ordinary service takes the new price: ' ||
  (select price_minor = 19500 and agency_price_minor = 17550
   from public.services s join public.websites w on w.id = s.website_id
   where w.slug = 'bulk-price-test' and s.type = 'guest-post');

/*
  A hand-set price is somebody's decision. A bulk recalculation is not allowed
  to overwrite it, and the guard lives in the function rather than in whichever
  caller happens to be running - the same reason the blocklist check sits in a
  trigger.
*/
select 'a hand-set price is left exactly as it was: ' ||
  (select price_minor = 25000
   from public.services s join public.websites w on w.id = s.website_id
   where w.slug = 'bulk-price-test' and s.type = 'niche-edit');

/*
  The reason this is a function and not an upsert.

  `upsert … on conflict (website_id, type)` would have rewritten the whole row,
  so every service it touched would have come back with turnaround 1-5 and no
  note. Nobody would have noticed until a publisher asked why their stated
  three-to-nine days had become one-to-five.
*/
select 'turnaround survives the write: ' ||
  (select turnaround_min_days = 3 and turnaround_max_days = 9
   from public.services s join public.websites w on w.id = s.website_id
   where w.slug = 'bulk-price-test' and s.type = 'guest-post');

select 'and so does the note: ' ||
  (select note = 'keep me'
   from public.services s join public.websites w on w.id = s.website_id
   where w.slug = 'bulk-price-test' and s.type = 'guest-post');

/*
  Priced means sellable.

  A service approved from the publisher inbox is created at zero and
  unavailable - we know what it costs us, we do not know what we charge. This
  is the moment we know, so it becomes available; without it a listing is fully
  priced and still refuses to publish.
*/
select 'pricing an unavailable service makes it sellable: ' ||
  (select available and price_minor = 12000
   from public.services s join public.websites w on w.id = s.website_id
   where w.slug = 'bulk-price-test' and s.type = 'digital-pr');

-- A service nobody sent is not touched.
select 'a service left out of the batch is untouched: ' ||
  (select public.pricing_apply_service_prices('[]'::jsonb) = 0);

/*
  Caught rather than asserted around - the earlier version of this check read
  `then 'false' else 'false'`, which passes whatever the function does.
*/
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.pricing_apply_service_prices('{"not":"an array"}'::jsonb);
  exception when others then
    v_raised := true;
  end;
  raise notice 'a malformed payload raises: %', v_raised;
end;
$$;

-- ------------------------------------------------- who may call it at all

/*
  `security definer` runs past row level security and PostgREST publishes every
  public function as an RPC endpoint. Without the revokes an unauthenticated
  POST could rewrite every sell price in the marketplace.
*/
do $$
declare v_refused boolean := false;
begin
  begin
    set local role anon;
    perform public.pricing_apply_service_prices('[]'::jsonb);
  exception when insufficient_privilege then
    v_refused := true;
  end;
  reset role;
  raise notice 'anon is refused: %', v_refused;
end;
$$;
