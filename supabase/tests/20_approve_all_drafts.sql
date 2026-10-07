\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- What an approve-all may touch.
--
-- The three rules used to be reassembled by each caller - a column filter, a
-- JavaScript filter on `flags`, and a separately computed set of contested
-- domains. 0058 put them in one function, and this is what stops them
-- drifting apart again. Every row below is a draft that must NOT be swept up.
-- ---------------------------------------------------------------------------

insert into public.inbound_emails (message_id, from_address, subject, status, sent_at, body_text)
values
  ('aa-1', 'one@pub.test', 'Rates', 'extracted', timezone('utc', now()), 'body'),
  ('aa-2', 'two@pub.test', 'Rates', 'extracted', timezone('utc', now()), 'body')
on conflict (message_id) do nothing;

-- Eligible: confident, unflagged, quoted once.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'clean-one.test', 'pending', '{"guest_post_cost": 120}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-1';
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'clean-two.test', 'pending', '{"guest_post_cost": 140}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-2';

/*
  A draft carrying "single price, confirm niches" is precisely the one a human
  has to look at. AGENTS.md: a reply giving one number and never mentioning
  topics leaves every niche unknown and is flagged for a human.
*/
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'flagged.test', 'pending', '{"guest_post_cost": 160}'::jsonb, 0, '{single-price}'
from public.inbound_emails where message_id = 'aa-1';

insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'unsure.test', 'pending', '{"guest_post_cost": 180}'::jsonb, 2, '{}'
from public.inbound_emails where message_id = 'aa-1';

/*
  Contested: two people quoting the same domain.

  Approving one of two offers overwrites the other's price and contact with
  nobody looking, which is why these are held back from every bulk path.
*/
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'contested.test', 'pending', '{"guest_post_cost": 200}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-1';
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'contested.test', 'pending', '{"guest_post_cost": 240}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-2';

/*
  Contested by an already-approved sibling, which is the harder half.

  Only one of these is pending, so a rule that looked at pending alone would
  call it uncontested and sweep it up - against a domain somebody has already
  decided about.
*/
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'half-done.test', 'approved', '{"guest_post_cost": 300}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-1';
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'half-done.test', 'pending', '{"guest_post_cost": 320}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-2';

-- Already dealt with, in both directions.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'already-in.test', 'approved', '{}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-1';
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'said-no.test', 'rejected', '{}'::jsonb, 0, '{}'
from public.inbound_emails where message_id = 'aa-1';

/*
  Scoped to this file's own domains.

  Earlier tests seed drafts into the same database, so an assertion over
  everything the function returns is really an assertion about every test that
  ran before it - which fails for reasons that have nothing to do with the
  rule being checked. This one failed exactly that way first time.
*/
select 'only the clean drafts here are eligible: ' ||
  coalesce((select string_agg(domain, ',' order by domain)
            from public.draft_approval_batch(1000, '{}', false)
            where domain like '%.test' and domain like 'clean-%'),
           '(NONE - CHECK STOPPED CHECKING)');

/*
  The count and the batch must agree, or the progress bar divides by a
  denominator the run can never reach.
*/
select 'the count agrees with the batch: ' ||
  (public.draft_approval_eligible_count(false) =
   (select count(*) from public.draft_approval_batch(100000, '{}', false)));

select 'a flagged draft is never swept up: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'flagged.test');
select 'nor one with a low-confidence field: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'unsure.test');
select 'nor a domain two people quoted: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'contested.test');
select 'nor one whose other offer is already approved: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'half-done.test');
select 'an approved draft is not offered again: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'already-in.test');
select 'nor a rejected one: ' ||
  (select count(*) = 0 from public.draft_approval_batch(100, '{}', false) where domain = 'said-no.test');

/*
  The exclusion list is how a run makes progress past a draft it cannot
  approve. `listing_drafts` has no failed status, so a draft that throws stays
  pending and would be handed back for ever; the run remembers it instead.
*/
select 'an excluded draft is not handed back: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000,
     array(select id from public.listing_drafts where domain = 'clean-one.test'), false)
   where domain = 'clean-one.test');
select 'and excluding one leaves the others alone: ' ||
  (select count(*) = 1 from public.draft_approval_batch(1000,
     array(select id from public.listing_drafts where domain = 'clean-one.test'), false)
   where domain = 'clean-two.test');

select 'the limit is respected: ' ||
  (select count(*) = 1 from public.draft_approval_batch(1, '{}', false));

-- ------------------------------------------------------- claiming a run ----
insert into public.draft_approval_runs (id, total, started_by)
values ('99999999-9999-9999-9999-999999999999', 2, 'admin@press.test')
on conflict (id) do nothing;

select 'a running run is claimable: ' ||
  (public.claim_draft_approval_run(600) = '99999999-9999-9999-9999-999999999999');

/*
  And only once.

  Two overlapping cron ticks both claiming would walk the same queue and run
  `approveDraft` twice on the same drafts. `for update skip locked` is what
  stops that, and this is the assertion that pins it.
*/
select 'a freshly claimed run is not claimed again: ' ||
  (public.claim_draft_approval_run(600) is null);

update public.draft_approval_runs
   set status = 'finished', claimed_at = null
 where id = '99999999-9999-9999-9999-999999999999';

select 'a finished run is not claimed at all: ' ||
  (public.claim_draft_approval_run(600) is null);

-- ---------------------------------------------------------------------------
-- 0059: the priced rule
--
-- Against a real backlog the strict rule matched 17 drafts out of 7,204, and
-- the difference was almost entirely publishers who quoted one number and
-- never mentioned gambling - the ordinary case. The priced rule lets those
-- through and still refuses the two flags that mean the row would be wrong.
-- ---------------------------------------------------------------------------

-- Flagged only for quoting one price with no niche detail: the common case.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'one-price.test', 'pending',
       '{"guest_post_cost": 150, "currency": "USD"}'::jsonb, 0, '{single-price-confirm-niches}'
from public.inbound_emails where message_id = 'aa-1';

-- Low confidence, but it states a price.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'unsure-but-priced.test', 'pending',
       '{"guest_post_cost": 170, "currency": "USD"}'::jsonb, 3, '{}'
from public.inbound_emails where message_id = 'aa-1';

/*
  A number with no unit.

  Stored anyway once, and read as pounds everywhere downstream, which is how a
  publisher quoting dollars came to be shown as quoting pounds. This is not a
  judgement about how careful to be - the row would be wrong.
*/
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'no-currency.test', 'pending',
       '{"guest_post_cost": 190}'::jsonb, 0, '{price-without-currency}'
from public.inbound_emails where message_id = 'aa-1';

-- The reply is about a different domain than the draft.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'other-site.test', 'pending',
       '{"guest_post_cost": 210, "currency": "USD"}'::jsonb, 0, '{different-site-offered}'
from public.inbound_emails where message_id = 'aa-1';

-- No price at all: nothing to record and nothing to spread.
insert into public.listing_drafts (email_id, domain, status, proposed, low_confidence_count, flags)
select id, 'no-price.test', 'pending', '{"currency": "USD"}'::jsonb, 0, '{no-contact-email}'
from public.inbound_emails where message_id = 'aa-1';

select 'the priced rule takes a single-price draft: ' ||
  (select count(*) = 1 from public.draft_approval_batch(1000, '{}', true)
   where domain = 'one-price.test');
select 'and one the model was unsure about, if it states a price: ' ||
  (select count(*) = 1 from public.draft_approval_batch(1000, '{}', true)
   where domain = 'unsure-but-priced.test');

select 'but never a price with no currency: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000, '{}', true)
   where domain = 'no-currency.test');
select 'nor a reply about a different site: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000, '{}', true)
   where domain = 'other-site.test');
select 'nor one with no price at all: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000, '{}', true)
   where domain = 'no-price.test');

/*
  Contested still wins over the priced rule.

  Relaxing which flags are tolerable must not relax this: approving one of two
  offers overwrites the other's price and contact with nobody looking, and
  that is true however confident the extraction was.
*/
select 'a contested domain is refused in both modes: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000, '{}', true)
   where domain in ('contested.test', 'half-done.test'));

-- The strict rule is unchanged by any of this.
select 'the strict rule still refuses the single-price draft: ' ||
  (select count(*) = 0 from public.draft_approval_batch(1000, '{}', false)
   where domain = 'one-price.test');

select 'each mode has its own count, and priced is the larger: ' ||
  (public.draft_approval_eligible_count(true) > public.draft_approval_eligible_count(false));
select 'the priced count agrees with its batch: ' ||
  (public.draft_approval_eligible_count(true) =
   (select count(*) from public.draft_approval_batch(100000, '{}', true)));
