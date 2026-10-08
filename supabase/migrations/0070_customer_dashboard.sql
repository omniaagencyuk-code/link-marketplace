-- ---------------------------------------------------------------------------
-- 0070  The customer dashboard, counted by the database
--
-- The dashboard read every order the customer has, with every item on each
-- one, and counted them in JavaScript - and then read them all again for a
-- table showing five. Fine for a customer with three orders and not for an
-- agency with four hundred.
--
-- ## These are NOT `security definer`
--
-- Every admin function in this schema is, because the admin signs in with a
-- shared password and carries no `auth.uid()`. A customer is the opposite:
-- they are a real Supabase identity and row level security already scopes
-- `orders` and `order_items` to them. A definer here would bypass that and
-- turn one wrong `where` clause into one customer reading another's spend.
--
-- So they run as the caller, RLS applies as it does to every other read the
-- customer makes, and the `user_id = auth.uid()` below is belt and braces
-- rather than the only thing standing between two customers.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.customer_dashboard_summary()
returns table (
  active_orders bigint,
  in_progress bigint,
  awaiting_content bigint,
  live_links bigint,
  live_links_this_month bigint,
  total_spend_minor bigint,
  orders_all bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select o.id, o.status, o.total_minor, o.placed_at
    from public.orders o
    where o.user_id = auth.uid()
  ),
  /*
    Live links are placements, not orders.

    An order with four placements on it is four links, and counting orders
    would under-report what the customer actually bought. The item carries
    its own status, so this is the real number rather than an approximation
    from the order it sits on.
  */
  placements as (
    select i.id, i.status, o.placed_at
    from public.order_items i
    join mine o on o.id = i.order_id
  )
  select
    (select count(*) from mine where status in ('awaiting-content', 'in-progress', 'submitted')),
    (select count(*) from mine where status = 'in-progress'),
    (select count(*) from mine where status = 'awaiting-content'),
    (select count(*) from placements where status = 'live'),
    (select count(*) from placements
      where status = 'live' and placed_at >= date_trunc('month', timezone('utc', now()))),
    -- The spend rule the dashboard already used: everything except a
    -- cancelled order and a draft basket nobody has paid for.
    (select coalesce(sum(total_minor), 0) from mine
      where status not in ('cancelled', 'draft')),
    (select count(*) from mine where status <> 'draft');
$$;

comment on function public.customer_dashboard_summary() is
  'The signed-in customer''s own figures. Security invoker on purpose: row level security scopes it, and a definer here would be one wrong where-clause away from one customer reading another''s spend.';

/*
  Publishers to suggest, from what this customer has actually bought.

  Not a recommendation engine and not sold as one. The only signal the server
  can see is the categories the customer has ordered in - saved sites live in
  the browser's own storage, so nothing here knows about them.

  With no orders there is no signal at all, and the caller says so: the
  section is headed "Popular websites" rather than claiming to be personal.
  That distinction is the whole reason this returns a flag.
*/
create or replace function public.customer_recommendations(p_limit integer default 4)
returns table (
  id uuid,
  personalised boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select distinct w.primary_category_id as category_id
    from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.websites w on w.id = i.website_id
    where o.user_id = auth.uid()
      and o.status <> 'draft'
      and w.primary_category_id is not null
  ),
  bought as (
    select distinct i.website_id
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.user_id = auth.uid()
  ),
  /*
    Only what a customer may buy today.

    `status = 'active'` is what row level security already allows them to
    read, so this is not the thing protecting it - it is here so a paused or
    archived listing is never suggested, which would be an offer we cannot
    honour.
  */
  sellable as (
    select w.id, w.domain, w.domain_rating, w.primary_category_id
    from public.websites w
    where w.status = 'active'
      and not exists (select 1 from bought b where b.website_id = w.id)
      and exists (
        select 1 from public.services s
        where s.website_id = w.id and s.available and s.price_minor > 0
      )
  )
  select
    sellable.id,
    (select count(*) > 0 from mine) as personalised
  from sellable
  where (select count(*) from mine) = 0
     or sellable.primary_category_id in (select category_id from mine)
  -- Strongest first, then a stable tiebreak so the list does not reshuffle
  -- between one page load and the next.
  order by sellable.domain_rating desc nulls last, sellable.id asc
  limit greatest(1, least(coalesce(p_limit, 4), 12));
$$;

comment on function public.customer_recommendations(integer) is
  'Active listings to suggest, from the categories this customer has ordered in. Returns personalised=false when they have no orders, so the caller can head the section honestly.';
