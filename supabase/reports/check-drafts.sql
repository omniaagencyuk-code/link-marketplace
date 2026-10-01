/*
  What the extraction actually read, for every draft from one reply.
  Read-only.

  Paste into the Supabase SQL editor and run. Change the address in the WHERE
  clause for a different publisher, or swap it for a date.

  This exists because a rate card listing a hundred and twenty domains makes a
  hundred and twenty drafts, and opening each one to see whether the price
  landed on the right site is not a review - it is data entry with extra
  steps. One table, one scan, and the rows that are wrong stand out because
  the rows beside them are right.

  Reading it:

  - `price` and `currency` are what we would pay. A null price with a live
    row means the model found no number for that domain.
  - The niche columns are the tri-state. `no` means the reply explicitly
    refused it. `unknown` means the reply never mentioned it, which is NOT
    permission - nothing is sold on an unknown.
  - `casino_price` and the others are what that topic costs when it differs
    from the general price.
  - `restriction` is where a condition like "licensed casinos only" should
    have landed. A gambling `yes` with a null restriction, on a card that
    stated one, is the single most expensive thing on this screen.
  - `low` counts fields the model was unsure of. A high number is not a
    failure; it is the draft to open first.
*/

select
  d.domain,
  d.status,

  (d.proposed ->> 'guest_post_cost')::numeric            as price,
  d.proposed ->> 'currency'                              as currency,
  d.proposed ->> 'language'                              as lang,

  d.proposed -> 'niches' -> 'gambling' ->> 'accepted'    as casino,
  (d.proposed -> 'niches' -> 'gambling' ->> 'guest_post_cost')::numeric as casino_price,
  d.proposed -> 'niches' -> 'loan'     ->> 'accepted'    as loan,
  d.proposed -> 'niches' -> 'dating'   ->> 'accepted'    as dating,
  d.proposed -> 'niches' -> 'cbd'      ->> 'accepted'    as cbd,
  d.proposed -> 'niches' -> 'crypto'   ->> 'accepted'    as crypto,
  d.proposed -> 'niches' -> 'forex'    ->> 'accepted'    as forex,
  d.proposed -> 'niches' -> 'adult'    ->> 'accepted'    as adult,

  (d.proposed ->> 'min_live_months')::int                as live_months,
  (d.proposed ->> 'min_word_count')::int                 as min_words,
  (d.proposed ->> 'max_links')::int                      as max_links,
  d.proposed ->> 'permanence'                            as permanence,
  d.proposed ->> 'topic_restriction'                     as restriction,
  d.proposed ->> 'contact_email'                         as contact,

  d.low_confidence_count                                 as low,
  coalesce(array_length(d.flags, 1), 0)                  as flags,
  d.matched_website_id is not null                       as already_listed

from public.listing_drafts d
join public.inbound_emails e on e.id = d.email_id
where e.from_address ilike '%mgdk.dk%'          -- the publisher to check
  and d.status = 'pending'
order by (d.proposed ->> 'guest_post_cost')::numeric desc nulls last, d.domain;
