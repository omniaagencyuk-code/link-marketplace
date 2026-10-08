-- ---------------------------------------------------------------------------
-- 0069  The admin dashboard, counted by the database
--
-- The dashboard read `getAllForAdmin()`, `orderService.getAll()` and
-- `userService.getAll()` and did its arithmetic in JavaScript: every listing
-- with costs and contacts joined on, every order, every profile, to render
-- four numbers and a list of six categories. That is the read 0067 spent a
-- migration removing from the website table, still here on the page people
-- open first.
--
-- Six functions, each one aggregate. Nothing returns a row per listing.
--
-- The revenue rule is the one the page already used and is not re-decided
-- here: everything except `cancelled` and `draft`. A draft is a basket nobody
-- has paid for and a cancelled order is money that never arrived, and both
-- were already excluded - changing that silently would move every revenue
-- figure on the site.
--
-- `security definer` with the revokes below, for the reason every admin
-- function here has them: the admin signs in with a shared password and
-- carries no `auth.uid()`, so row level security hands them nothing, and a
-- `security definer` function in `public` is a PostgREST endpoint for anyone
-- holding the anon key. What leaks here is our revenue.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard_totals(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  websites_active bigint,
  websites_total bigint,
  customers bigint,
  orders_in_range bigint,
  orders_previous bigint,
  revenue_in_range bigint,
  revenue_previous bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with window_bounds as (
    select
      coalesce(p_from, '-infinity'::timestamptz) as starts,
      coalesce(p_to, 'infinity'::timestamptz) as ends
  ),
  /*
    The preceding window of the same length, for "compared with the period
    before". Only computable when the range is bounded at both ends: "all
    time" has nothing before it, and a percentage against nothing is a
    number somebody would read as real.
  */
  previous_bounds as (
    select
      case when p_from is null or p_to is null then null else p_from - (p_to - p_from) end as starts,
      p_from as ends
  ),
  counted as (
    select
      o.status,
      o.total_minor,
      o.placed_at
    from public.orders o
    where o.status not in ('cancelled', 'draft')
  )
  select
    (select count(*) from public.websites where status = 'active'),
    (select count(*) from public.websites),
    (select count(*) from public.profiles where role = 'customer'),
    (select count(*) from counted, window_bounds
      where counted.placed_at >= window_bounds.starts and counted.placed_at < window_bounds.ends),
    (select count(*) from counted, previous_bounds
      where previous_bounds.starts is not null
        and counted.placed_at >= previous_bounds.starts
        and counted.placed_at < previous_bounds.ends),
    (select coalesce(sum(counted.total_minor), 0) from counted, window_bounds
      where counted.placed_at >= window_bounds.starts and counted.placed_at < window_bounds.ends),
    (select coalesce(sum(counted.total_minor), 0) from counted, previous_bounds
      where previous_bounds.starts is not null
        and counted.placed_at >= previous_bounds.starts
        and counted.placed_at < previous_bounds.ends);
$$;

comment on function public.admin_dashboard_totals(timestamptz, timestamptz) is
  'The four dashboard figures, counted in the database. Revenue excludes cancelled and draft orders, which is the rule the page already used.';

/*
  Revenue a day at a time, with the empty days in it.

  `generate_series` rather than a group-by, because a chart drawn from only
  the days that had an order joins the dots across the ones that did not and
  shows a smooth line through a week when nothing sold.
*/
create or replace function public.admin_revenue_series(
  p_from timestamptz,
  p_to timestamptz
)
returns table (day date, revenue_minor bigint, orders bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    days.day::date,
    coalesce(sum(o.total_minor), 0)::bigint,
    count(o.id)::bigint
  from generate_series(
         date_trunc('day', p_from),
         date_trunc('day', p_to),
         interval '1 day'
       ) as days(day)
  left join public.orders o
    on o.placed_at >= days.day
   and o.placed_at < days.day + interval '1 day'
   and o.status not in ('cancelled', 'draft')
  group by days.day
  order by days.day;
$$;

comment on function public.admin_revenue_series(timestamptz, timestamptz) is
  'Revenue and order count per day across a range, including the days with none so a chart cannot draw through them.';

/*
  Every status, including the ones at zero.

  Read off the enum rather than off the rows, so a legend keeps the same
  entries from one day to the next - a slice that vanishes when it empties
  reads as a status that was removed.
*/
create or replace function public.admin_orders_by_status(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (status text, orders bigint, total_minor bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    every_status.label::text,
    count(o.id)::bigint,
    coalesce(sum(o.total_minor), 0)::bigint
  from unnest(enum_range(null::public.order_status)) as every_status(label)
  left join public.orders o
    on o.status = every_status.label
   and o.placed_at >= coalesce(p_from, '-infinity'::timestamptz)
   and o.placed_at < coalesce(p_to, 'infinity'::timestamptz)
  group by every_status.label
  order by every_status.label;
$$;

comment on function public.admin_orders_by_status(timestamptz, timestamptz) is
  'Order counts per status, every status listed whether or not it has any, so a legend does not change shape.';

create or replace function public.admin_top_categories(p_limit integer default 8)
returns table (slug text, name text, websites bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.slug, c.name, count(w.id)::bigint
  from public.categories c
  join public.websites w
    on w.primary_category_id = c.id
   and w.status = 'active'
  group by c.slug, c.name
  having count(w.id) > 0
  order by count(w.id) desc, c.slug asc
  limit greatest(1, least(coalesce(p_limit, 8), 50));
$$;

comment on function public.admin_top_categories(integer) is
  'Marketplace categories by how many active listings sit in them.';

/*
  The most recent orders, with the one join a row needs.

  The domain is the first placement on the order plus how many others there
  are, rather than every item: a list of five orders should not be a read of
  every line on them.
*/
create or replace function public.admin_recent_orders(p_limit integer default 6)
returns table (
  id uuid,
  reference text,
  status text,
  total_minor integer,
  placed_at timestamptz,
  customer text,
  website_domain text,
  item_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.reference,
    o.status::text,
    o.total_minor,
    o.placed_at,
    coalesce(nullif(btrim(p.full_name), ''), p.email) as customer,
    first_item.domain,
    coalesce(counted.items, 0)::bigint
  from public.orders o
  left join public.profiles p on p.id = o.user_id
  left join lateral (
    select w.domain
    from public.order_items i
    join public.websites w on w.id = i.website_id
    where i.order_id = o.id
    order by i.id asc
    limit 1
  ) as first_item on true
  left join lateral (
    select count(*) as items from public.order_items i where i.order_id = o.id
  ) as counted on true
  where o.status <> 'draft'
  order by o.placed_at desc, o.id asc
  limit greatest(1, least(coalesce(p_limit, 6), 25));
$$;

comment on function public.admin_recent_orders(integer) is
  'The latest orders for the dashboard list. Drafts are left out, being baskets rather than orders.';

/*
  What is waiting for somebody, for the bell in the top bar.

  Real queues rather than a notification system, because there is not one.
  Each of these is a page an admin can open and act on.
*/
create or replace function public.admin_queue_counts()
returns table (drafts_pending bigint, duplicate_domains bigint, publishable bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.listing_drafts where status = 'pending'),
    (select count(*) from (
       select d.domain
       from public.listing_drafts d
       where d.status in ('pending', 'approved')
       group by d.domain
       having count(*) > 1
     ) as contested),
    public.website_publish_eligible_count()::bigint;
$$;

comment on function public.admin_queue_counts() is
  'Counts for the queues an admin can act on: drafts awaiting review, domains offered by more than one seller, and listings ready to publish.';

revoke all on function public.admin_dashboard_totals(timestamptz, timestamptz) from public;
revoke all on function public.admin_dashboard_totals(timestamptz, timestamptz) from anon;
revoke all on function public.admin_dashboard_totals(timestamptz, timestamptz) from authenticated;

revoke all on function public.admin_revenue_series(timestamptz, timestamptz) from public;
revoke all on function public.admin_revenue_series(timestamptz, timestamptz) from anon;
revoke all on function public.admin_revenue_series(timestamptz, timestamptz) from authenticated;

revoke all on function public.admin_orders_by_status(timestamptz, timestamptz) from public;
revoke all on function public.admin_orders_by_status(timestamptz, timestamptz) from anon;
revoke all on function public.admin_orders_by_status(timestamptz, timestamptz) from authenticated;

revoke all on function public.admin_top_categories(integer) from public;
revoke all on function public.admin_top_categories(integer) from anon;
revoke all on function public.admin_top_categories(integer) from authenticated;

revoke all on function public.admin_recent_orders(integer) from public;
revoke all on function public.admin_recent_orders(integer) from anon;
revoke all on function public.admin_recent_orders(integer) from authenticated;

revoke all on function public.admin_queue_counts() from public;
revoke all on function public.admin_queue_counts() from anon;
revoke all on function public.admin_queue_counts() from authenticated;
