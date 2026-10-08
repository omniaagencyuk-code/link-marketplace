-- ---------------------------------------------------------------------------
-- Repair: the currency for 410 listings whose commercial terms never landed
--
-- Not a migration. It changes data rather than schema, it is run once, and it
-- is kept here because a change to production data with nothing recording it
-- is a change nobody can check afterwards.
--
-- The listings hold a cost in `service_costs` and have no `website_commercials`
-- row at all, so there is nothing saying what money the figure is in. The
-- engine cannot convert them, so it cannot price them, so they are drafts that
-- will never publish. The cause is fixed in code: one value the column refused
-- failed the whole terms upsert, the upsert's error was never checked, and the
-- costs had already been written.
--
-- Nothing here is guessed. Each listing takes the currency the model read out
-- of that publisher's own email, which is still sitting in the draft - and
-- they are not all the same, which is the point of doing it per listing. 409
-- read EUR and one read GBP, and a blanket update would have quietly made that
-- publisher's costs 1.17x wrong.
--
-- Three listings it deliberately will not touch:
--
--   * a domain whose drafts disagree about the currency. Choosing between two
--     sellers is what the duplicates queue is for, and picking the smaller is
--     not a rule anybody agreed to.
--   * a draft whose currency is not an ISO code - '€', 'Euro', 'US$'. All of
--     them meant something and none can be looked up, so storing one only
--     moves the problem to a rate lookup that finds nothing.
--   * a listing that already has a terms row. Its currency is whatever was
--     recorded deliberately, and this is not the thing to overwrite it.
--
-- Re-runnable: `on conflict do nothing` means a second run writes nothing.
-- ---------------------------------------------------------------------------

with blank as (
  select distinct w.id
  from public.websites w
  join public.services s on s.website_id = w.id
  join public.service_costs sc on sc.service_id = s.id
  left join public.website_commercials wc on wc.website_id = w.id
  where wc.website_id is null
),
agreed as (
  select
    b.id,
    count(distinct upper(btrim(d.proposed ->> 'currency'))) as answers,
    max(upper(btrim(d.proposed ->> 'currency'))) as currency
  from blank b
  join public.listing_drafts d on d.domain = (select w.domain from public.websites w where w.id = b.id)
  where upper(btrim(coalesce(d.proposed ->> 'currency', ''))) ~ '^[A-Z]{3}$'
  group by b.id
)
insert into public.website_commercials (website_id, cost_currency, notes)
select
  a.id,
  a.currency,
  'Currency recovered from the publisher draft. The terms written at approval were refused by the database and the error was not checked, so the cost was stored without it.'
from agreed a
where a.answers = 1
on conflict (website_id) do nothing;
