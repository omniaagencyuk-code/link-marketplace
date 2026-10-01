/*
  Where has a pasted rate card got to? Read-only.

  Run this when the checks come back empty. It does not need you to know the
  publisher's address - it finds the emails that have had rates pasted into
  them and says what happened to each one.

  Reading the `stage` column:

    waiting to be read   The text is stored and the email is back in the
                         queue. Nothing has been extracted yet. Press Read
                         on the publisher inbox.
    being read           Claimed by a run that is still going.
    read, no drafts      Extraction ran and produced nothing. The reply is
                         there to look at; the text may not have been
                         readable as prices.
    read, N drafts       Done. Use the address in `from_address` in the two
                         check queries.
    failed               Extraction errored. `status_reason` says why.

  `from_address` is the address to paste into the other two queries. It is
  the person who emailed us, which is usually NOT the contact written inside
  the rate card - that is what an empty check usually means.
*/

select
  e.from_address,
  e.asked_about_domain                                   as asked_about,
  to_char(e.rate_card_added_at, 'DD Mon HH24:MI')        as rates_added,
  e.rate_card_added_by                                   as added_by,
  e.status,
  case
    when e.status = 'failed'                       then 'failed'
    when e.status = 'new' and e.batch_id is null   then 'waiting to be read'
    when e.status = 'new'                          then 'being read'
    when count(d.id) = 0                           then 'read, no drafts'
    else 'read, ' || count(d.id) || ' drafts'
  end                                                    as stage,
  count(d.id)                                            as drafts,
  count(d.id) filter (where d.status = 'pending')         as still_pending,
  length(e.body_text)                                     as body_chars,
  left(coalesce(e.status_reason, ''), 120)                as status_reason

from public.inbound_emails e
left join public.listing_drafts d on d.email_id = e.id
where e.rate_card_added_at is not null
group by e.id, e.from_address, e.asked_about_domain, e.rate_card_added_at,
         e.rate_card_added_by, e.status, e.batch_id, e.body_text, e.status_reason
order by e.rate_card_added_at desc;
