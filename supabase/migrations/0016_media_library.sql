-- ---------------------------------------------------------------------------
-- The media library
--
-- Until now an image in the CMS was a path an editor typed, which meant every
-- picture on the site had to be committed to the repository first. That is a
-- deployment for a photograph, and it put the one job an editor most wants to
-- do themselves behind a developer.
--
-- Files live in Supabase Storage; this table is the index over them. The row
-- carries what the picker needs to show a library - a thumbnail, a name, a
-- size, alt text - and what a page needs to render one, which is the URL.
--
-- Uploads run as the service role, because the admin area holds no Supabase
-- identity (see `getAdminScopedClient`). The bucket is public to read: a
-- marketing image is published the moment it is used, and signing URLs for
-- pictures that appear on an indexable page would be ceremony without a
-- benefit. Nothing private is ever put here - the marketplace inventory is
-- protected by row level security on its own tables, not by this bucket.
-- ---------------------------------------------------------------------------

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  -- Path inside the bucket. Unique so a re-upload of the same name cannot
  -- leave two rows pointing at one object.
  storage_path text not null unique,
  -- The public URL, resolved once at upload rather than rebuilt on every read.
  url text not null,
  filename text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  -- Read in the browser before upload, so the picker can show a sensible
  -- aspect ratio and a page can reserve space.
  width integer,
  height integer,
  -- Travels with the file, so an editor writes it once rather than on every
  -- page that uses the image.
  alt text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  created_by text
);

create index media_assets_created_idx on public.media_assets (created_at desc);

comment on table public.media_assets is
  'Index over the media storage bucket. Rows are created by the admin upload action.';

alter table public.media_assets enable row level security;

-- Admins manage it; nobody else reads it. The public site never queries this
-- table - a page stores the URL it was given, so rendering an image needs no
-- access to the library at all.
create policy "Admins manage media"
  on public.media_assets for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- The bucket
--
-- Guarded, because this migration is also replayed against a plain PostgreSQL
-- database by `verify:rls`, which has no storage schema. On Supabase it
-- creates the bucket; anywhere else it says so and carries on.
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'media',
    'media',
    true,
    5242880,
    array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif']
  )
  on conflict (id) do nothing;
exception
  when undefined_table or invalid_schema_name then
    raise notice 'No storage schema here - create the "media" bucket in Supabase.';
end;
$$;
