-- ---------------------------------------------------------------------------
-- Undo 0021: order items following the order
--
-- Puts set_order_status back to moving the order alone. It does NOT put the
-- items back into draft - they are now correct, and un-correcting them would
-- be vandalism rather than a rollback.
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
begin
  update public.orders
     set status = p_status, updated_at = timezone('utc', now())
   where id = p_order_id;

  if not found then
    raise exception 'Order % does not exist', p_order_id;
  end if;

  insert into public.order_status_history (order_id, status, note, changed_by)
  values (p_order_id, p_status, p_note, p_changed_by);
end;
$$;

revoke all on function public.set_order_status(uuid, public.order_status, text, text) from public;
grant execute on function public.set_order_status(uuid, public.order_status, text, text) to service_role;
