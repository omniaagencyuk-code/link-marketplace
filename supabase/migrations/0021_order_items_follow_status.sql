-- ---------------------------------------------------------------------------
-- Order items follow the order they belong to
--
-- `set_order_status` moved the order and left its items behind. Payment moved
-- an order to 'awaiting-content' while every line in it stayed 'draft', and
-- the customer's order list - which shows the line, because that is what a
-- customer is buying - went on saying draft about an order they had paid for.
--
-- Only items still in step with the order move. An item the team has
-- individually advanced to 'live', or cancelled on its own, has a status that
-- means something, and a blanket update would erase exactly the information
-- somebody took the trouble to record.
-- ---------------------------------------------------------------------------

create or replace function public.set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_changed_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.order_status;
begin
  select status into v_previous from public.orders where id = p_order_id for update;

  if v_previous is null then
    raise exception 'Order % does not exist', p_order_id;
  end if;

  update public.orders
     set status = p_status, updated_at = timezone('utc', now())
   where id = p_order_id;

  -- Items that were keeping pace with the order keep pace with it. One that
  -- has been moved on its own is left exactly as it is.
  update public.order_items
     set status = p_status, updated_at = timezone('utc', now())
   where order_id = p_order_id
     and status = v_previous;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_status, p_note, p_changed_by);
end;
$$;

revoke all on function public.set_order_status(uuid, public.order_status, text, text) from public;
grant execute on function public.set_order_status(uuid, public.order_status, text, text) to service_role;

-- Orders already paid, whose items never moved. Scoped to items still sitting
-- in draft under an order that has moved on: anything else was set
-- deliberately.
update public.order_items as item
   set status = parent.status,
       updated_at = timezone('utc', now())
  from public.orders as parent
 where parent.id = item.order_id
   and item.status = 'draft'
   and parent.status <> 'draft';
