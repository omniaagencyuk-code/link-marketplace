-- Puts the column back and the table away. Anything staged is carried across,
-- and becomes readable by anyone holding the publishable key again - which is
-- why 0042 exists. Do not run this on a live database.
alter table public.page_sections add column if not exists draft jsonb;

update public.page_sections section
set draft = jsonb_build_object(
      'variant', draft_row.variant,
      'animation', draft_row.animation,
      'style', draft_row.style,
      'values', draft_row.values
    )
from public.section_drafts draft_row
where draft_row.section_id = section.id;

drop table if exists public.section_drafts;
