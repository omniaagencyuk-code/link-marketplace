-- Rollback for 0038_page_template.
--
-- Drops the column. Every custom page goes back to rendering through
-- ServicePage, which is what they all did before 0038 - so a niche page made
-- in the admin keeps all of its content and loses the design it chose, rather
-- than disappearing.

alter table public.custom_pages drop constraint if exists custom_pages_template_known;
alter table public.custom_pages drop column if exists template;
