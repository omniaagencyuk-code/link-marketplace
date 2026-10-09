-- ---------------------------------------------------------------------------
-- 0074  The admin order table, one page at a time
--
-- `/admin/orders` reads every order - with every item and every issue joined
-- on - and renders all of them into one table with no paging at all, from a
-- read that asks for everything in one request and discards its error.
--
-- A correction, because the first version of this header got it wrong and
-- the wrong version is the one somebody would quote. It said the cap was
-- already biting. Counted afterwards: 2 orders, 0 content orders, 4
-- profiles. The inventory is 12,000 sites and the customer side has not
-- launched. The figure behind that claim - "thirteen hundred orders" - was
-- invented in a comment on the admin users page a day earlier and then read
-- back as evidence.
--
-- What is true at 2 orders and at 200,000:
--
--   * The read discards its error. A failed query becomes an empty array,
--     and an empty array renders as a marketplace that has never sold
--     anything - which nobody reports as a bug, only as "no orders".
--   * PostgREST caps a single response and says nothing in it. The page
--     would print the length of whatever came back as the number of orders.
--     That is the sentence the website table printed before 0067, against
--     an inventory that really had outgrown it.
--
-- So this is paging ahead of needing it, on the one table whose row count is
-- whatever the business does next. Worth saying plainly rather than
-- dressing it up as a fire.
--
-- The same shape as 0067, for the same reasons: this returns the ids for one
-- page and the total, and the caller maps those few rows through the select
-- it already has. Nothing here duplicates the row-to-object mapping.
--
-- ## What a search matches
--
-- What the table puts on screen: the reference, the customer's name and
-- email, and the domain of any placement on the order.
--
-- The domain comes from `order_items.website_domain` rather than from
-- `websites`. That is the copy taken at the moment of purchase, and 0018
-- added it for the reason that applies here too: an order is a record of
-- what was bought at the terms of the day. The table renders that column, so
-- searching the publisher's current domain instead would mean typing what is
-- on screen and being told there is no such order.
--
-- It is matched with `exists` rather than a join. A join to `order_items`
-- returns an order once per item, so an order for three placements would be
-- three rows in the page and counted three times in the total.
--
-- `position(... in ...)` rather than LIKE, because a search term is input and
-- `%` and `_` are wildcards in a LIKE pattern - a term of all wildcards would
-- match every order placed.
--
-- `security definer` with the revokes below: the admin signs in with a shared
-- password and carries no `auth.uid()`, so `is_admin()` is false for them and
-- row level security would hand them nothing. That is why every admin read
-- goes through the service role, and why this must be unreachable by anyone
-- else - this one reaches every customer's orders and their email addresses.
--
-- Written to survive being run twice.
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
  -- The order the full read arrived in, so the table is unchanged by this.
  -- `id` as well, because `placed_at` is not unique: two orders sharing a
  -- timestamp would come back in whichever order the plan produced, and page
  -- two could repeat a row from page one.
  order by matched.placed_at desc, matched.id asc
  limit greatest(1, least(coalesce(p_limit, 50), 250))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_order_page(text, text, integer, integer) is
  'One page of the admin order table. Returns ids and the total; the caller maps the rows with the select it already has.';

revoke all on function public.admin_order_page(text, text, integer, integer) from public;
revoke all on function public.admin_order_page(text, text, integer, integer) from anon;
revoke all on function public.admin_order_page(text, text, integer, integer) from authenticated;
