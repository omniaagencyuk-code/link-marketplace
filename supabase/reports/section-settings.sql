/*
  What is actually stored for each section of the homepage. Read-only.

  Paste into the Supabase SQL editor and run. Change 'home' below for any
  other page.

  This settles one question and nothing else: when an animation is chosen and
  saved, does it reach the database? There are two very different bugs behind
  "the animations aren't saving", and they need opposite fixes:

    entrance comes back 'none'  ->  the save is dropping it. The form, the
                                    action, or the column.

    entrance comes back 'fade-up' (or any other value) -> it saved. What is
                                    broken is the rendering, and the fix is
                                    nowhere near the editor.

  The background is shown beside it on purpose, since that is the control
  that is known to work - so the two can be compared on the same row rather
  than from memory.

  `draft` matters too. A section with a pending preview renders from the
  draft rather than from what is saved, so a draft holding an old animation
  will keep showing it however many times the real one is saved.
*/

select
  s.position,
  s.component,
  s.hidden,
  s.animation ->> 'entrance'  as entrance,
  s.animation ->> 'speed'     as speed,
  s.animation ->> 'delay'     as delay,
  s.style     ->> 'background' as background,
  s.style     ->> 'text'       as text_tone,
  d.section_id is not null     as has_pending_preview,
  d.animation ->> 'entrance'   as preview_entrance,
  s.updated_at
from public.page_sections s
left join public.section_drafts d on d.section_id = s.id
where s.page_slug = 'home'
order by s.position;
