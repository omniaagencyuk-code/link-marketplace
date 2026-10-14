-- ---------------------------------------------------------------------------
-- Undo 0085  The customer's own reference on an order
--
-- Destroys the labels customers put on their own orders. Every order keeps
-- its row, its placements, its price and our own `reference`; what goes is
-- the only thing on the order that says which person at a shared account
-- placed it.
--
-- Nothing else holds it and nothing can rebuild it - it was typed by hand at
-- checkout. Copy it out first if those orders are still live:
--
--   select reference, customer_reference from public.orders
--    where customer_reference is not null order by placed_at desc;
--
-- Run it alongside 0084-era code. Current code writes the column at
-- checkout, so dropping it without reverting the code makes every order
-- fail at the insert - loudly, which is the right failure for a payment.
--
-- The function first, and not as tidiness. `admin_order_page` names the
-- column in its body, and a `language sql` function with a quoted body is
-- stored as text rather than parsed - so Postgres lets the column go
-- without complaint and the function breaks on its next call, which is the
-- admin orders page returning nothing for every search. Putting 0074's
-- version back before the drop is what keeps that from happening.
-- ---------------------------------------------------------------------------

create or replace function public.admin_order_page(
  p_search text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select o.id, o.placed_at
    from public.orders o
    join public.profiles p on p.id = o.user_id
    where (p_status is null or p_status = 'all' or o.status::text = p_status)
      and (
        coalesce(btrim(p_search), '') = ''
        or position(
             lower(btrim(p_search)) in
             lower(o.reference || ' ' || coalesce(p.full_name, '') || ' ' || coalesce(p.email, ''))
           ) > 0
        or exists (
             select 1
             from public.order_items oi
             where oi.order_id = o.id
               and position(lower(btrim(p_search)) in lower(oi.website_domain)) > 0
           )
      )
  )
  select matched.id, count(*) over () as total
  from matched
  order by matched.placed_at desc, matched.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 250))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_order_page(text, text, integer, integer) is
  'One page of the admin order table. Returns ids and the total; the caller maps the rows with the select it already has.';

revoke all on function public.admin_order_page(text, text, integer, integer) from public;
revoke all on function public.admin_order_page(text, text, integer, integer) from anon;
revoke all on function public.admin_order_page(text, text, integer, integer) from authenticated;

drop index if exists public.orders_customer_reference_idx;

alter table public.orders drop column if exists customer_reference;
