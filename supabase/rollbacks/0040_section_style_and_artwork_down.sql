-- Drops the section style and the artwork library.
--
-- Every section goes back to the colour its component draws, and any artwork
-- naming is lost - the images themselves stay, because they are media assets
-- and always were.
drop index if exists public.media_assets_artwork_slug_idx;
drop index if exists public.media_assets_artwork_idx;

alter table public.media_assets drop constraint if exists media_assets_artwork_category;
alter table public.media_assets drop constraint if exists media_assets_artwork_name_length;

alter table public.media_assets
  drop column if exists artwork_name,
  drop column if exists artwork_category,
  drop column if exists artwork_slug,
  drop column if exists description,
  drop column if exists placement,
  drop column if exists aspect,
  drop column if exists active;

alter table public.page_sections drop constraint if exists page_sections_style_object;
alter table public.page_sections drop column if exists style;

alter table public.global_sections drop constraint if exists global_sections_style_object;
alter table public.global_sections drop column if exists style;
