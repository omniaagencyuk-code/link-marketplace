-- ---------------------------------------------------------------------------
-- 0041  Seeing a change before publishing it
--
-- One nullable column. A section has what it renders, and optionally what it
-- is about to render: `draft` holds a pending {variant, values, style,
-- animation} that only an administrator asking for a preview ever sees.
--
-- A column rather than a table because a draft belongs to exactly one section
-- and dies with it. A `section_drafts` table would need the same foreign key,
-- the same policies and a cleanup nobody would write, to hold at most one row
-- per section.
--
-- Null is the normal state. A section with no draft is a section as it was
-- before this migration, and the public read does not select this column at
-- all - see `page-section-repository.ts`, where the anon path uses a column
-- list that cannot return it rather than a filter that has to remember to.
--
-- Additive. Running this changes nothing anybody can see.
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

alter table public.page_sections
  add column if not exists draft jsonb;

-- Null means no pending change. Anything else is an object, for the same
-- reason `values` and `animation` are: jsonb will store a bare string, and
-- every reader here expects a record.
alter table public.page_sections drop constraint if exists page_sections_draft_object;
alter table public.page_sections
  add constraint page_sections_draft_object check (
    draft is null or jsonb_typeof(draft) = 'object'
  );

-- Which pages have unpublished changes, for the badge in the admin list.
create index if not exists page_sections_draft_idx
  on public.page_sections (page_slug)
  where draft is not null;

comment on column public.page_sections.draft is
  'A pending edit an administrator has previewed but not published. Null normally. Never selected by the public read.';
