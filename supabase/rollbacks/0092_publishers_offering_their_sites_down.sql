-- ---------------------------------------------------------------------------
-- Undo 0092  A publisher offering us their site
--
-- **Destroys every offer a publisher has sent us.** Each row is a person who
-- filled in /list-your-site: their name, their address, the site they own and
-- what they want paid for a placement on it. Nothing else holds any of it -
-- there is no inbound email behind these, which is the whole difference
-- between this table and `listing_drafts`.
--
-- Copy them out first, and read them before you do:
--
--   select created_at, full_name, email, domain, placement_type,
--          price_minor, currency, status, message
--     from public.publisher_submissions
--    order by created_at desc;
--
-- An unanswered offer dropped here is inventory somebody tried to sell us
-- and never heard back about, which costs more than the feature not existing.
--
-- Run it alongside 0091-era code. Current code writes this table from the
-- form on /list-your-site, so dropping it without reverting the code makes
-- every submission fail - loudly, which is the right failure: the
-- alternative is a form that thanks a publisher and throws their offer away.
-- ---------------------------------------------------------------------------

drop index if exists public.publisher_submissions_status_created_idx;
drop index if exists public.publisher_submissions_created_idx;
drop index if exists public.publisher_submissions_domain_idx;

drop table if exists public.publisher_submissions;
