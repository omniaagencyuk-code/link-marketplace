-- ---------------------------------------------------------------------------
-- 0089  There were no plans, so there is no plan column
--
-- `profiles.plan` has been there since 0001, defaulting to 'starter'. Nobody
-- could ever sign up to a plan, nothing charged for one, and the billing page
-- carried a hardcoded line - "7% discount applied automatically to every
-- placement" - that was true of no account on the system.
--
-- It was not decoration, though. `tierFor(user.plan)` was read at the
-- listing's order card, in the basket and twice at checkout, and an account
-- marked 'agency' was genuinely charged the stored agency rate. The code that
-- did that is gone in the same change as this; a promo code is now the only
-- discount, applied by Stripe and reported back.
--
-- What is NOT removed: `agency_price_minor` on the services and the niche
-- prices. Those are still stored, still editable in the admin, and still what
-- a plan would charge. The day plans exist, what has to be built is the plan.
--
-- ## The function that would have broken quietly
--
-- `admin_user_rows` (0071) selects `p.plan` and names it in its `returns
-- table`. A `language sql` function's body is stored as text rather than
-- parsed, so Postgres lets the column go without complaint and the admin user
-- list breaks on its next call - the same trap 0085's rollback is written
-- around. So the function is replaced first, in the same transaction, and a
-- `returns table` cannot be narrowed by `create or replace`, which is why it
-- is dropped and recreated rather than replaced.
--
-- ## Order matters on the way out
--
-- Take the code first. Current code does not name the column anywhere - it is
-- absent from the profile select, the mapper, the API and the admin table -
-- so this is safe to run before or after a deploy of it. Run it while
-- 0088-era code is still live and `customer-access.ts` asks for `plan` in a
-- select list, which PostgREST answers with an error for the whole row: every
-- signed-in page loses its user.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

begin;

-- ------------------------------------------- the function, without the plan
drop function if exists public.admin_user_rows();

create function public.admin_user_rows()
returns table (
  id uuid,
  email text,
  full_name text,
  company text,
  role text,
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

-- --------------------------------------------------------- and the column
alter table public.profiles drop column if exists plan;

commit;
