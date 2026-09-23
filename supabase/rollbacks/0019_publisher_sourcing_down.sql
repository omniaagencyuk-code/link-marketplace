-- ---------------------------------------------------------------------------
-- Undo 0019: publisher email sourcing
--
-- Run this to back the feature out completely. It is safe to run whether or
-- not 0019 was applied, and safe to run twice.
--
-- What it removes and what it keeps, stated plainly because one of these is
-- not reversible:
--
--   REMOVED, with their data: inbound_emails, listing_drafts,
--   extraction_batches, website_niche_costs, website_commercials,
--   website_niche_policy. Every email you imported and every draft you had
--   not yet approved goes with them. Export anything you want first.
--
--   KEPT: every listing approved from a draft. Approval writes through the
--   same path the CSV importer uses, into `websites`, `services` and
--   `service_costs`, so an approved listing is an ordinary listing and does
--   not depend on any of this. Backing the feature out does not un-import
--   the publishers it found.
--
--   KEPT: the CSV import path, which never touched any of these tables.
--
-- The columns added to existing tables are dropped too. That loses the terms
-- those columns hold (permanence, dofollow expiry, the publisher-written
-- rate) on every listing, whether it came from an email or was typed in.
-- ---------------------------------------------------------------------------

drop table if exists public.listing_drafts cascade;

-- Dropped before extraction_batches: inbound_emails.batch_id references it.
drop table if exists public.inbound_emails cascade;

drop table if exists public.extraction_batches cascade;

drop table if exists public.website_niche_costs cascade;

drop table if exists public.website_commercials cascade;

drop table if exists public.website_niche_policy cascade;

alter table public.service_costs
  drop constraint if exists service_costs_publisher_written_check;

alter table public.service_costs
  drop column if exists cost_publisher_written_minor;

alter table public.websites drop column if exists dofollow_expires_after_months;
alter table public.websites drop column if exists permanence;
alter table public.websites drop column if exists min_live_months;
alter table public.websites drop column if exists homepage_placement;
alter table public.websites drop column if exists topic_restriction;

-- Last, because the policy table above uses it.
drop type if exists public.niche_stance;
