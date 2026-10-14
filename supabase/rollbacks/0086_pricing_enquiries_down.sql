-- ---------------------------------------------------------------------------
-- Undo 0086  Somebody asking what a bigger order would cost
--
-- **Destroys every pricing enquiry.** Each row is a message a person sent us
-- asking to talk about rates: their name, their work address, their employer
-- and what they said they could spend. Nothing else holds any of it - it was
-- typed into a form by somebody who is waiting for a reply, and there is no
-- second copy anywhere.
--
-- Copy them out first, and read them before you do:
--
--   select created_at, full_name, email, company, budget_band, interest,
--          status, message
--     from public.pricing_enquiries
--    order by created_at desc;
--
-- An unanswered enquiry dropped here is a customer who asked us for a price
-- and never heard back, which is worse than the feature not existing.
--
-- Run it alongside 0085-era code. Current code writes this table from the
-- pricing page's form, so dropping it without reverting the code makes every
-- submission fail - loudly, which is the right failure: the alternative is a
-- form that thanks somebody and throws their message away.
-- ---------------------------------------------------------------------------

drop index if exists public.pricing_enquiries_status_created_idx;
drop index if exists public.pricing_enquiries_created_idx;

drop table if exists public.pricing_enquiries;
