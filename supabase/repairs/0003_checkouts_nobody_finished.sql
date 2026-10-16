-- Orders that are the remains of a checkout nobody finished.
--
-- What was observed: six orders in /admin/orders, four of them from one
-- afternoon of testing, three of those the same domain ordered three times.
-- Nothing was wrong with any of them: an order row is written *before* the
-- customer is sent to Stripe - deliberately, so that somebody who pays and
-- then loses their connection still has an order for the payment to attach
-- itself to - and every abandoned attempt leaves one behind.
--
-- The application no longer adds to the pile: a customer's next checkout
-- rewrites their open order instead of writing another, having first
-- expired the previous Stripe session so the old tab cannot be paid. This
-- clears what accumulated before that.
--
-- ## Why it is safe to delete these, and the condition that makes it so
--
-- A Stripe Checkout session stays payable for 24 hours after it is created.
-- Until then, deleting the order would be the one genuinely dangerous
-- thing in this file: the webhook finds an order by its session id, so a
-- customer finishing an old tab would pay with nothing left to record it
-- against. `placed_at` is written immediately before the session is
-- created, so 25 hours is past the point where any session on these rows
-- can still be paid - the extra hour is margin, not arithmetic.
--
-- Everything else on the row goes with it and should: `order_items`,
-- `order_status_history` and the link monitor rows all cascade, and a
-- promo redemption cannot exist because redemptions are recorded when a
-- payment lands.
--
-- Nothing paid, part-paid, refunded or failed is touched. Nothing that
-- reached any status beyond `draft` is touched - that is an order somebody
-- bought.
--
-- ## Re-runnable
--
-- It deletes what matches and finds nothing the second time. Run it again
-- whenever the list fills up, or leave it: the orders page files these
-- under "Not completed" and the admin table marks them "Not paid yet", so
-- they are labelled correctly whether or not anybody clears them.

-- Look first. Run this on its own to see what would go.
--
--   select reference, placed_at, total_minor, payment_status
--     from public.orders
--    where status = 'draft'
--      and payment_status in ('unpaid', 'processing')
--      and paid_at is null
--      and stripe_payment_intent_id is null
--      and placed_at < timezone('utc', now()) - interval '25 hours';

delete from public.orders
 where status = 'draft'
   and payment_status in ('unpaid', 'processing')
   -- Both, because either one alone would be enough to mean it was paid and
   -- neither is written without the other.
   and paid_at is null
   and stripe_payment_intent_id is null
   and placed_at < timezone('utc', now()) - interval '25 hours';
