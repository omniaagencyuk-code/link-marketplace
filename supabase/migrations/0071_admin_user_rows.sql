-- ---------------------------------------------------------------------------
-- 0071  The admin user list, counted by the database
--
-- `/admin/users` read every profile AND every order, then filtered the orders
-- once per user to work out their count and their spend. That is a nested
-- loop in JavaScript over two whole tables: at nine hundred customers and
-- thirteen hundred orders it is over a million comparisons to draw a table,
-- and it grows as the product of both.
--
-- One function instead. The spend rule is the one the page already used and
-- is not re-decided here: everything except `cancelled` and `draft`.
--
-- `security definer` with the revokes below, like every admin function here:
-- the admin signs in with a shared password and carries no `auth.uid()`, so
-- row level security hands them nothing. What leaks without the revokes is
-- every customer's name, address and lifetime spend.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.admin_user_rows()
returns table (
  id uuid,
  email text,
  full_name text,
  company text,
  role text,
  plan text,
  created_at timestamptz,
  orders bigint,
  spend_minor bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.full_name,
    p.company,
    p.role::text,
    p.plan,
    p.created_at,
    coalesce(tallied.orders, 0)::bigint,
    coalesce(tallied.spend_minor, 0)::bigint
  from public.profiles p
  left join (
    select
      o.user_id,
      count(*) as orders,
      sum(o.total_minor) as spend_minor
    from public.orders o
    -- A draft is a basket nobody has paid for; a cancelled order is money
    -- that never arrived. Both were already excluded by the page.
    where o.status not in ('cancelled', 'draft')
    group by o.user_id
  ) as tallied on tallied.user_id = p.id
  order by p.created_at desc, p.id asc;
$$;

comment on function public.admin_user_rows() is
  'Every account with its order count and lifetime spend, counted in one pass. Replaces reading every profile and every order and filtering one against the other.';

revoke all on function public.admin_user_rows() from public;
revoke all on function public.admin_user_rows() from anon;
revoke all on function public.admin_user_rows() from authenticated;
