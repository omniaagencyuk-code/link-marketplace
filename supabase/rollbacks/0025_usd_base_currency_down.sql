-- Undo 0025_usd_base_currency.sql.
--
-- Puts the engine back on pounds at the same rate it went across. It is not a
-- perfect inverse: rounding to the penny each way means a price converted out
-- and back can land a penny from where it started, and any price recalculated
-- while on dollars comes back as whatever the engine made of it rather than
-- what it was before. Recalculate afterwards.
--
-- Orders are untouched here too. They carry their own currency.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'fx_rates' and column_name = 'rate_to_base'
  ) then
    alter table public.fx_rates rename column rate_to_base to rate_to_gbp;
    alter table public.fx_rates rename column previous_rate_to_base to previous_rate_to_gbp;
  end if;
end;
$$;

alter table public.fx_rates drop column if exists base_currency;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'price_calculations'
       and column_name = 'cost_base_minor'
  ) then
    alter table public.price_calculations rename column cost_base_minor to cost_gbp_minor;
  end if;
end;
$$;

-- Guarded the same way the migration is, and on the same flag: divide once.
do $$
declare
  rate constant numeric := 1.34;
  on_usd boolean;
begin
  select currency = 'USD' into on_usd from public.settings limit 1;

  if not coalesce(on_usd, false) then
    raise notice 'Not on USD - nothing converted back.';
    return;
  end if;

  delete from public.fx_rates;
  insert into public.fx_rates (currency, rate_to_gbp, source)
  values ('GBP', 1, 'fixed')
  on conflict (currency) do nothing;

  update public.pricing_rules
     set min_margin_minor = round(min_margin_minor / rate),
         paypal_fee_fixed_minor = 30,
         bank_fee_fixed_minor = round(bank_fee_fixed_minor / rate)
   where id = 1;

  update public.pricing_bands
     set min_cost_minor = round(min_cost_minor / rate),
         flat_minor = case when flat_minor is null then null else round(flat_minor / rate) end;

  update public.pricing_rounding set min_minor = round(min_minor / rate);

  update public.services
     set price_minor = round(price_minor / rate),
         agency_price_minor = case
           when agency_price_minor is null then null
           else round(agency_price_minor / rate)
         end;

  update public.website_niche_prices
     set price_minor = round(price_minor / rate),
         agency_price_minor = case
           when agency_price_minor is null then null
           else round(agency_price_minor / rate)
         end;

  delete from public.price_calculations;
  update public.settings set currency = 'GBP';
end;
$$;
