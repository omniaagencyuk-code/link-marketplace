-- Rollback for 0036_page_sections.
--
-- Drops both tables. Every page that had been migrated onto them falls back to
-- rendering from code, which is what it did before 0036 - so the site keeps
-- working and loses whatever had been built in the admin since.
--
-- page_content and custom_pages are untouched, because 0036 never touched
-- them: the copy inside the sections that had not been migrated is still
-- there.

drop table if exists public.page_sections;
drop table if exists public.global_sections;
