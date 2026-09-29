-- ============================================================================
-- 0033  Trust Flow, Citation Flow, and what links to a site
-- ============================================================================
-- Three numbers and three labels per listing, from a Majestic Bulk Backlink
-- Checker export. They are a quality signal a buyer reads, so they live on
-- `websites` and in a table anyone signed in can read - unlike costs and
-- contacts, which have their own admin-only tables for the reason set out in
-- AGENTS.md.
--
-- Nullable on purpose, all of them. A trust flow of 0 is a measurement; a
-- trust flow nobody has taken is a gap. Printing the second as "0" on a
-- public card would be a claim we have not made, and the same mistake the
-- costs already avoid.
--
-- `website_topics` is its own table rather than six columns because the
-- topics are a list: a site has up to three, in order, each with a value.
-- Six columns would make "the second topic" a different kind of thing from
-- "the first", which is how a query ends up written three times.
--
-- Nothing here decides a category. A Topical Trust Flow topic describes who
-- links to a site, not what the site publishes - of 910 domains measured, 38
-- led with a gambling topic against the hundreds whose publishers have said
-- in writing that they will run gambling content. `websites.primary_category`
-- stays a human's decision; this only produces something to suggest.
--
-- Reversible: supabase/rollbacks/0033_majestic_metrics_down.sql
-- ============================================================================

-- ------------------------------------------------ the two headline numbers --

alter table public.websites
  add column if not exists trust_flow smallint,
  add column if not exists citation_flow smallint;

alter table public.websites
  add column if not exists majestic_updated_at timestamptz;

comment on column public.websites.trust_flow is
  'Majestic Trust Flow, 0-100. Null means nobody has measured it, which is not the same as zero.';

comment on column public.websites.citation_flow is
  'Majestic Citation Flow, 0-100. Null means nobody has measured it.';

comment on column public.websites.majestic_updated_at is
  'When a Majestic export last wrote to this listing, so a stale figure can be spotted.';

-- Buyers sort and filter on trust flow, and a partial index keeps the
-- unmeasured rows out of it rather than storing a null per listing.
create index if not exists websites_trust_flow_idx
  on public.websites (trust_flow desc) where trust_flow is not null;

-- ------------------------------------------------------------ the topics --

create table if not exists public.website_topics (
  website_id uuid not null references public.websites (id) on delete cascade,
  -- 0, 1, 2: Majestic's own ordering, strongest first. Part of the key so a
  -- re-import replaces a listing's topics rather than accumulating them.
  position smallint not null check (position between 0 and 2),
  topic text not null,
  value smallint not null default 0,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (website_id, position)
);

comment on table public.website_topics is
  'Majestic Topical Trust Flow: what links to a site, strongest first. Evidence shown to buyers, never a category.';

alter table public.website_topics enable row level security;

do $$
begin
  create policy "Anyone can read website topics"
    on public.website_topics for select using (true);
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create policy "Admins manage website topics"
    on public.website_topics for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create trigger website_topics_set_updated_at
    before update on public.website_topics
    for each row execute function public.set_updated_at();
exception
  when duplicate_object then null;
end;
$$;

-- --------------------------------------------- the three added categories --
-- From the inventory rather than from a brainstorm: mapping 910 domains'
-- Majestic topics onto the existing thirteen left 227 unplaced, and they
-- clustered in news and media, science and the environment, and education.
--
-- Geography deliberately got no category. Seventy-two domains lead with a
-- Regional topic, and "Europe" is not something anybody shops for.

insert into public.categories (slug, name, description, position, featured)
values
  ('news-media', 'News & Media', 'Newspapers, magazines, broadcasters and the media industry.', 14, false),
  ('science-environment', 'Science & Environment', 'Research, climate, energy, agriculture and the natural world.', 15, false),
  ('education', 'Education & Reference', 'Schools, universities, courses, libraries and archives.', 16, false)
on conflict (slug) do nothing;
