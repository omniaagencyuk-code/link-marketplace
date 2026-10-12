-- ---------------------------------------------------------------------------
-- 0083  The planner counts in the database
--
-- The Reports tab totals a whole project: links planned and live per month,
-- spend by month and by source, and the link type, anchor type and status
-- breakdowns. Everything it needs is already in `planner_links`. The
-- question is where the counting happens.
--
-- ## Why this is not a read and a loop
--
-- Reading every row of a project and adding them up in JavaScript works
-- until it silently stops working. PostgREST caps a response at a thousand
-- rows and says nothing about it in the response - 0068 records the same
-- trap on the admin table, where a header checkbox cheerfully reported
-- "1000 selected" against 12,246 listings. A report is worse than a
-- checkbox: an agency with two years of plans would get a spend figure
-- short by however many rows fell past the cap, with nothing on the screen
-- saying so, and they would take it to a client meeting.
--
-- So the grouping happens here, where there is no cap, and what comes back
-- is one row per combination that actually exists. A thousand-link project
-- becomes a few dozen rows.
--
-- ## What it does NOT do
--
-- It does not decide what "paid" or "committed" mean. Those definitions
-- live in `src/lib/planner/summary.ts` and there is exactly one of them;
-- a second copy in SQL would drift, and the copy that drifted would be the
-- one somebody budgets against. This returns counts and three sums per
-- group, and the TypeScript applies the rules to them.
--
-- The one piece of arithmetic that has to be here is `greatest(0, price -
-- paid)`, clamped per row before it is summed. Summing first and clamping
-- afterwards would let one overpaid row cancel out another's shortfall.
--
-- ## Who may call it
--
-- Nobody but the service role, the same arrangement every other planner
-- read has. `p_user_id` is in the `where` clause rather than taken from
-- `auth.uid()`, because the application calls this with the service-role
-- client - and the execute grant is revoked from `anon` and
-- `authenticated` so that id cannot be supplied by whoever is asking.
--
-- Re-runnable: `create or replace`, and the revokes are idempotent.
-- Destroys nothing and changes no table.
-- ---------------------------------------------------------------------------

create or replace function public.planner_report_rows(
  p_user_id uuid,
  p_project_id uuid,
  p_month date default null
)
returns table (
  dimension text,
  bucket text,
  category text,
  payment_status text,
  currency text,
  n integer,
  price_sum bigint,
  paid_sum bigint,
  owing_sum bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select
      p.plan_month,
      p.source,
      p.link_type,
      p.anchor_type,
      p.status_id,
      p.payment_status,
      p.currency,
      s.category,
      coalesce(p.price_minor, 0) as price,
      /* What has actually left, per row. A paid row is paid in full; a
         partly paid one is paid what was recorded against it; an unpaid
         one is nothing, whatever its status says. A link can go live
         before the invoice does. */
      case p.payment_status
        when 'paid' then coalesce(p.price_minor, 0)
        when 'partially_paid' then coalesce(p.paid_minor, 0)
        else 0
      end as paid
    from public.planner_links p
    join public.planner_statuses s on s.id = p.status_id
    where p.user_id = p_user_id
      and p.project_id = p_project_id
      and (p_month is null or p.plan_month = p_month)
  ),
  grouped as (
    select 'month'::text as dimension, to_char(plan_month, 'YYYY-MM-DD') as bucket,
           category, payment_status, currency, price, paid
      from mine
    union all
    select 'source', source, category, payment_status, currency, price, paid from mine
    union all
    select 'linkType', link_type, category, payment_status, currency, price, paid from mine
    union all
    select 'anchorType', anchor_type, category, payment_status, currency, price, paid from mine
    union all
    select 'status', status_id::text, category, payment_status, currency, price, paid from mine
  )
  select
    dimension,
    bucket,
    category::text,
    payment_status::text,
    currency::text,
    count(*)::integer,
    sum(price)::bigint,
    sum(paid)::bigint,
    /* Clamped per row, then summed. The other order would let one
       overpaid row pay off another's shortfall. */
    sum(greatest(0, price - paid))::bigint
  from grouped
  group by dimension, bucket, category, payment_status, currency;
$$;

comment on function public.planner_report_rows(uuid, uuid, date) is
  'Counts and sums a planner project by month, source, link type, anchor type and status. Counting only - what paid and committed mean lives in summary.ts, which is the only copy.';

revoke all on function public.planner_report_rows(uuid, uuid, date) from public;
revoke all on function public.planner_report_rows(uuid, uuid, date) from anon;
revoke all on function public.planner_report_rows(uuid, uuid, date) from authenticated;
