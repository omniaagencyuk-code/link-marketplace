/*
  One row: did the extraction read this reply, or only half of it? Read-only.

  Run this first, then check-drafts.sql for the detail. It answers the
  question a hundred and twenty rows cannot be scanned for - whether
  something went wrong the same way everywhere.

  What a healthy run looks like for a card with a banned-verticals column:

  - `with_price` close to `drafts`. A gap means rows the model found no
    number for - fine if the card had blanks, wrong if it did not.
  - `casino_unknown` near zero. The card stated casino prices and refusals
    explicitly, so unknown everywhere means that column was never read.
  - `crypto_no` and `forex_no` equal to `drafts`. The card bans both on
    every row; anything less means the banned list was read for some rows
    and not others.
  - `with_live_months` equal to `drafts`. Every row said 36 months.
  - `casino_yes_no_restriction` should be ZERO on a card that says
    "licensed casinos only". Every one of those is a listing that would sell
    gambling without the condition attached.
*/

select
  count(*)                                                              as drafts,
  count(*) filter (where (proposed ->> 'guest_post_cost') is not null)  as with_price,
  count(distinct proposed ->> 'currency')                               as currencies,

  count(*) filter (where proposed -> 'niches' -> 'gambling' ->> 'accepted' = 'yes')     as casino_yes,
  count(*) filter (where proposed -> 'niches' -> 'gambling' ->> 'accepted' = 'no')      as casino_no,
  count(*) filter (where coalesce(proposed -> 'niches' -> 'gambling' ->> 'accepted', 'unknown') = 'unknown') as casino_unknown,

  count(*) filter (where proposed -> 'niches' -> 'crypto' ->> 'accepted' = 'no')        as crypto_no,
  count(*) filter (where proposed -> 'niches' -> 'forex'  ->> 'accepted' = 'no')        as forex_no,
  count(*) filter (where proposed -> 'niches' -> 'adult'  ->> 'accepted' = 'no')        as adult_no,

  count(*) filter (where (proposed ->> 'min_live_months') is not null)  as with_live_months,
  count(*) filter (where (proposed ->> 'min_word_count') is not null)   as with_word_count,

  -- The expensive one. A yes with no condition recorded, on a card that
  -- stated one, is a licence requirement that has quietly disappeared.
  count(*) filter (
    where proposed -> 'niches' -> 'gambling' ->> 'accepted' = 'yes'
      and coalesce(proposed ->> 'topic_restriction', '') = ''
  )                                                                     as casino_yes_no_restriction,

  sum(low_confidence_count)                                             as low_fields_total,
  count(*) filter (where coalesce(array_length(flags, 1), 0) > 0)       as flagged

from public.listing_drafts d
join public.inbound_emails e on e.id = d.email_id
where e.from_address ilike '%mgdk.dk%'          -- the publisher to check
  and d.status = 'pending';
