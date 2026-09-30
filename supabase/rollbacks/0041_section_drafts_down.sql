-- Drops pending edits. Anything previewed but not published is lost; every
-- published section is untouched, because a draft never was what rendered.
drop index if exists public.page_sections_draft_idx;
alter table public.page_sections drop constraint if exists page_sections_draft_object;
alter table public.page_sections drop column if exists draft;
