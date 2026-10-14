-- ---------------------------------------------------------------------------
-- 0085  The customer's own reference on an order
--
-- An agency has one Press Parrot login and gives it to its team. Five people
-- order through it, and the orders list becomes a list nobody can find their
-- own work in: every row says the same company name, and `reference` is ours
-- - LM-10428 - which tells the person who placed it nothing.
--
-- So an order may carry a second reference, theirs. A name, a client, a
-- campaign, a purchase order number - whatever makes it findable to the
-- person who placed it. We never read it, never parse it and never act on
-- it. It is a label.
--
-- ## Why it is not `reference`
--
-- `reference` is ours and it is unique: it is what support quotes, what the
-- Stripe metadata carries and what an invoice shows. Theirs is neither
-- unique nor ours to generate - five people may all type "Sarah", and two
-- orders a month apart may both say "Q4 client push". Collapsing the two
-- would mean an order whose identity a customer could change, and a support
-- call about "order Sarah" that matches nine rows.
--
-- ## Nullable, and blank is not a value
--
-- Null means nobody labelled it. Most orders will not have one, because most
-- accounts are one person who does not need it. The column is trimmed to
-- null rather than stored as an empty string, so "has a reference" is one
-- question rather than two.
--
-- Destroys nothing: one nullable column on a table that keeps its rows.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists customer_reference text
    check (
      customer_reference is null
      or (length(customer_reference) between 1 and 120
          and customer_reference = btrim(customer_reference))
    );

comment on column public.orders.customer_reference is
  'The customer''s own label for this order - a name, a client, a PO number. Not unique, not ours, never parsed. Null means nobody labelled it.';

/*
  Finding one. Case-insensitive because somebody searching for "sarah" means
  the order labelled "Sarah", and partial because most orders carry nothing
  and an index over those rows is an index over nothing.
*/
create index if not exists orders_customer_reference_idx
  on public.orders (user_id, lower(customer_reference))
  where customer_reference is not null;

-- ---------------------------------------------------------------------------
-- Support has to be able to find it too
--
-- The point of the label is that the person who typed it can find the order
-- again, and half of finding an order again is ringing us about it. A
-- customer who says "my reference is Sarah - Northbound Q4" and is told
-- there is no such order has a label that only works on one screen.
--
-- So `admin_order_page` searches it as well. Everything else about the
-- function is 0074's and unchanged - the same `position(... in ...)` rather
-- than LIKE because the term is input, the same `exists` over the items so
-- an order with three placements is still one row, the same ordering and
-- the same revokes. `coalesce` because the column is null on most orders
-- and concatenating a null would blank the whole haystack, which is the bug
-- `full_name` and `email` already have the guard for.
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
             lower(o.reference || ' ' || coalesce(p.full_name, '') || ' '
                   || coalesce(p.email, '') || ' '
                   || coalesce(o.customer_reference, ''))
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
  -- The order the full read arrived in, so the table is unchanged by this.
  -- `id` as well, because `placed_at` is not unique: two orders sharing a
  -- timestamp would come back in whichever order the plan produced, and page
  -- two could repeat a row from page one.
  order by matched.placed_at desc, matched.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 250))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_order_page(text, text, integer, integer) is
  'One page of the admin order table. Returns ids and the total; the caller maps the rows with the select it already has. Searches our reference, the customer''s name and email, the customer''s own reference, and any placement''s domain.';

revoke all on function public.admin_order_page(text, text, integer, integer) from public;
revoke all on function public.admin_order_page(text, text, integer, integer) from anon;
revoke all on function public.admin_order_page(text, text, integer, integer) from authenticated;
