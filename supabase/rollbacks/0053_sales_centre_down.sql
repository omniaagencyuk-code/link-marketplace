-- ---------------------------------------------------------------------------
-- Undo 0053.
--
-- DESTROYS: the whole Sales Centre. Every prospect, every page crawled from
-- their site, every qualification the model produced, every contact found
-- (which is personal data somebody was charged Hunter credits for), every
-- campaign, every email drafted or sent, every reply, the timeline, the
-- attribution linking a prospect to the customer they became, and the Hunter
-- credit ledger that the budget is counted from.
--
-- Read that list twice. Two of those cannot be rebuilt by re-running
-- anything:
--
--   `sales_suppressions` is the do-not-contact list. Dropping it does not
--   just lose the rows - it removes the trigger that makes an unsubscribe
--   binding, so the next send path has nothing stopping it writing to
--   somebody who asked us not to. Export it before running this, and put it
--   somewhere that survives, whatever else you decide about the feature.
--
--   `prospect_attributions` is the record of which outreach produced which
--   customer. It is written once, when the match is made, precisely so a
--   later change to the matching rule cannot rewrite it - which also means
--   nothing can recompute it afterwards.
--
-- Orders, customers and the marketplace are untouched: nothing here owns a
-- row in any of them. `prospect_attributions` references `profiles`, so
-- dropping it removes the link and not the customer.
--
-- Take a dump of `sales_suppressions`, `prospect_attributions` and
-- `prospect_contacts` first. The tables go in dependency order; the types go
-- after the tables that use them.
-- ---------------------------------------------------------------------------

drop trigger if exists outbound_emails_guard_trigger on public.outbound_emails;
drop function if exists public.outbound_emails_guard();

drop function if exists public.sales_sendable(integer);
drop function if exists public.sales_claim_run(text, boolean, text);
drop function if exists public.sales_sent_today();
drop function if exists public.sales_ai_spend_this_month();
drop function if exists public.hunter_credits_this_cycle();
drop function if exists public.hunter_cycle_start();
drop function if exists public.sales_is_suppressed(text);

drop table if exists public.prospect_attributions;
drop table if exists public.prospect_events;
drop table if exists public.sales_replies;
drop table if exists public.outbound_emails;
drop table if exists public.campaign_steps;
drop table if exists public.sales_campaigns;
drop table if exists public.hunter_lookups;
drop table if exists public.prospect_contacts;
drop table if exists public.prospect_qualifications;
drop table if exists public.prospect_pages;
drop table if exists public.prospects;
drop table if exists public.sales_suppressions;
drop table if exists public.sales_runs;
drop table if exists public.sales_settings;

drop type if exists public.reply_classification;
drop type if exists public.outbound_status;
drop type if exists public.prospect_stage;
drop type if exists public.sales_segment;
