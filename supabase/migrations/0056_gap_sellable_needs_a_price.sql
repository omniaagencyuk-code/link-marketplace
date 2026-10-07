-- ---------------------------------------------------------------------------
-- 0056  "Available here" has to mean orderable
--
-- `gap_sellable` decides which gaps a report shows under "You can buy these
-- from us", and it is where the stored `sellable_found` figure comes from. Its
-- own comment in 0054 says "Only active, priced listings count" - but the
-- query only ever checked `status = 'active'`. Price does not live on
-- `websites`; it lives on `services`, one row per link type, each with its own
-- `available` flag. So a listing that is active but has no sellable service
-- was counted and offered.
--
-- That was survivable while the row only carried a "View listing" link. It
-- stops being survivable now the row carries an Add to order button: a site
-- with no priced service renders no button, so the report would be claiming
-- "you can order this today" above a row with no way to order it.
--
-- The fix is the check the comment always described. A service counts when it
-- is available and actually priced - `price_minor` is `>= 0`, so zero is a
-- legal value and means nothing is being charged, which is not an offer.
--
-- Only the function changes. No data is touched, and reports already run keep
-- the rows they stored: this decides what future reports count.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create or replace function public.gap_sellable(p_domains text[])
returns table (website_id uuid, domain text, domain_rating smallint, organic_traffic integer)
language sql
stable
security definer
set search_path = public
as $$
  select w.id, w.domain, w.domain_rating, w.organic_traffic
  from public.websites w
  where w.status = 'active'
    and w.domain = any (p_domains)
    and exists (
      select 1
      from public.services s
      where s.website_id = w.id
        and s.available
        and s.price_minor > 0
    );
$$;

revoke all on function public.gap_sellable(text[]) from public;
revoke all on function public.gap_sellable(text[]) from anon;
revoke all on function public.gap_sellable(text[]) from authenticated;
