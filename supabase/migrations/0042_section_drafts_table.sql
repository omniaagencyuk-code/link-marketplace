-- ---------------------------------------------------------------------------
-- 0042  Move pending edits off page_sections
--
-- 0041 put a `draft` column on `page_sections`, which has a policy letting
-- anyone read the sections of a published page. The application's public read
-- names its columns and `draft` was not among them, and that was taken for the
-- guarantee. It is not one.
--
-- Row level security is row level. A visitor holding the publishable key - it
-- ships in the browser bundle - can ask PostgREST for any column the policy
-- lets them see the row of:
--
--     GET /rest/v1/page_sections?select=draft&page_slug=eq.home
--
-- and read every unpublished change on the site. Proved against a local
-- database before this migration was written: the draft came straight back.
--
-- This is the rule AGENTS.md already states - "row level security cannot hide
-- a single column. Anything internal therefore lives in its own table with an
-- admin-only policy and no customer-facing policy at all" - and 0041 broke it.
-- Excluding one column with a column-level grant does not work either: these
-- roles hold table-wide SELECT, so the exclusion would mean enumerating every
-- other column and remembering to add the next one.
--
-- So a table, with no policy for anybody but an administrator. The foreign key
-- carries the cleanup: a section's pending edit dies with the section.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.section_drafts (
  -- One pending edit per section, so the id is the key. A second draft for
  -- one section is not a thing anybody means.
  section_id uuid primary key references public.page_sections(id) on delete cascade,

  -- Everything a save would have written, and nothing else. A draft that
  -- could hold something a save would refuse would be a way round the
  -- whitelist, discovered by publishing it.
  variant text not null default 'default',
  animation jsonb not null default '{}'::jsonb,
  style jsonb not null default '{}'::jsonb,
  values jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text,

  constraint section_drafts_variant_length check (char_length(variant) between 1 and 60),
  constraint section_drafts_values_object check (jsonb_typeof(values) = 'object'),
  constraint section_drafts_animation_object check (jsonb_typeof(animation) = 'object'),
  constraint section_drafts_style_object check (jsonb_typeof(style) = 'object')
);

drop trigger if exists section_drafts_set_updated_at on public.section_drafts;

create trigger section_drafts_set_updated_at
  before update on public.section_drafts
  for each row execute function public.set_updated_at();

alter table public.section_drafts enable row level security;

-- One policy, for administrators, and deliberately no second one. There is no
-- reading of this table by anon or by a signed-in customer, through the
-- application or through PostgREST or through anything else.
drop policy if exists "Admins manage section drafts" on public.section_drafts;

create policy "Admins manage section drafts"
  on public.section_drafts for all
  using (public.is_admin()) with check (public.is_admin());

-- The admin area carries no auth.uid() and writes through the service-role
-- client, which bypasses this policy - the same as every other admin write.
-- The policy is what keeps everybody else out.

comment on table public.section_drafts is
  'A change previewed and not published. Admin-only: it lives here rather than on page_sections because that table is publicly readable and RLS cannot hide a column.';

-- ------------------------------------------------------------ carry it over
--
-- Anything staged under 0041 moves rather than being lost, for anybody who
-- previewed something between the two migrations.
-- Dynamic, because a statement naming `page_sections.draft` is parsed before
-- it is run: on the second pass the column is gone and a plain INSERT fails
-- at parse time however it is guarded. These get pasted into the SQL editor
-- by hand and one that half-applied has to be safe to retry.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'page_sections' and column_name = 'draft'
  ) then
    execute $carry$
      insert into public.section_drafts (section_id, variant, animation, style, values)
      select
        id,
        coalesce(nullif(draft->>'variant', ''), 'default'),
        case when jsonb_typeof(draft->'animation') = 'object' then draft->'animation' else '{}'::jsonb end,
        case when jsonb_typeof(draft->'style') = 'object' then draft->'style' else '{}'::jsonb end,
        case when jsonb_typeof(draft->'values') = 'object' then draft->'values' else '{}'::jsonb end
      from public.page_sections
      where draft is not null
      on conflict (section_id) do nothing
    $carry$;
  end if;
end $$;

alter table public.page_sections drop constraint if exists page_sections_draft_object;
drop index if exists public.page_sections_draft_idx;
alter table public.page_sections drop column if exists draft;
