-- ---------------------------------------------------------------------------
-- 0040  What a section looks like, and the artwork library it draws from
--
-- Two additions, both of them shaped like `animation` was in 0036: a jsonb
-- column holding a few named choices, never a value. A section can say it is
-- "soft-blue"; it cannot say #E0F2FE, because there is nowhere here to put a
-- hex code and nothing that would read one.
--
-- The artwork half is columns on `media_assets` rather than a second table.
-- An artwork *is* an uploaded image that somebody has named and filed - the
-- upload path, the storage bucket, the admin screen and the picker all exist
-- already, and a parallel table would mean two of each. A media asset with no
-- category is what it always was: a picture somebody uploaded.
--
-- Additive. Running this changes nothing anybody can see.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- section style
--
-- {background, text, accent, decoration, artworkPosition, artworkSize}, each
-- one of a fixed set the registry names. The column says it is an object for
-- the same reason `animation` does: jsonb will happily store a bare string,
-- and every reader here expects a record.
alter table public.page_sections
  add column if not exists style jsonb not null default '{}'::jsonb;

alter table public.page_sections drop constraint if exists page_sections_style_object;
alter table public.page_sections
  add constraint page_sections_style_object check (jsonb_typeof(style) = 'object');

-- A global section carries its own look, so a shared call to action is the
-- same call to action on every page that uses it.
alter table public.global_sections
  add column if not exists style jsonb not null default '{}'::jsonb;

alter table public.global_sections drop constraint if exists global_sections_style_object;
alter table public.global_sections
  add constraint global_sections_style_object check (jsonb_typeof(style) = 'object');

comment on column public.page_sections.style is
  'Named choices from the CMS palette - background, text tone, accent, decoration, artwork placement. Never a colour value.';

-- ----------------------------------------------------------- artwork library
--
-- An uploaded image becomes part of the Press Parrot artwork library when it
-- is given a name and a category. Everything else about it - the file, its
-- size, its alt text - it already had.
alter table public.media_assets
  add column if not exists artwork_name text,
  add column if not exists artwork_category text,
  add column if not exists artwork_slug text,
  add column if not exists description text not null default '',
  -- Where it is drawn for, and what shape it is, so the picker can say
  -- "hero, portrait" rather than making an editor open it to find out.
  add column if not exists placement text not null default '',
  add column if not exists aspect text not null default '',
  -- Retired artwork stays in the library and stops being offered. Deleting it
  -- would break every page already using it.
  add column if not exists active boolean not null default true;

alter table public.media_assets drop constraint if exists media_assets_artwork_category;
alter table public.media_assets
  add constraint media_assets_artwork_category check (
    artwork_category is null
    or artwork_category in ('general', 'seo', 'niche', 'content', 'support', 'decoration')
  );

alter table public.media_assets drop constraint if exists media_assets_artwork_name_length;
alter table public.media_assets
  add constraint media_assets_artwork_name_length check (
    artwork_name is null or char_length(artwork_name) between 1 and 80
  );

-- One slug per artwork, so a page can point at "mascot-classic" and keep
-- pointing at it when the file behind it is replaced with a better drawing.
-- Partial, because most uploads are not artwork and null is not a slug.
create unique index if not exists media_assets_artwork_slug_idx
  on public.media_assets (artwork_slug)
  where artwork_slug is not null;

-- The library listing: by category, newest first, retired ones left out.
create index if not exists media_assets_artwork_idx
  on public.media_assets (artwork_category, created_at desc)
  where artwork_category is not null;

comment on column public.media_assets.artwork_slug is
  'Stable name a section points at, so replacing the file updates every page using it.';
