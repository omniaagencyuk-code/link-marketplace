-- Undo 0089.
--
-- Puts the column back with its original default, and the function back the
-- way 0071 wrote it. **What it cannot put back is which plan anybody was
-- on**: the values are gone with the column, and every row comes back as
-- 'starter'. If that matters, copy them out before running 0089:
--
--   select id, email, plan from public.profiles where plan <> 'starter';
--
-- Nothing in the application reads the column after 0089, so restoring it
-- changes nothing on its own - the pricing code that used to is gone in the
-- same change. This exists so the schema can be returned to where it was,
-- not so the feature can be.

begin;

alter table public.profiles
  add column if not exists plan text not null default 'starter';

drop function if exists public.admin_user_rows();

create function public.admin_user_rows()
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
    where o.status not in ('cancelled', 'draft')
    group by o.user_id
  ) as tallied on tallied.user_id = p.id
  order by p.created_at desc, p.id asc;
$$;

revoke all on function public.admin_user_rows() from public;
revoke all on function public.admin_user_rows() from anon;
revoke all on function public.admin_user_rows() from authenticated;

commit;
