-- ---------------------------------------------------------------------------
-- 0035  Blog posts get the sections the page used to hard-code
--
-- A post was a slug, some markdown, and a page that decided everything around
-- it: the same closing call to action on every article, the same three related
-- posts, and nowhere to put a question and its answer on a page that spends
-- its length answering questions. Each of those is a field now.
--
-- Two columns, both additive and both defaulted, so every existing post keeps
-- rendering exactly what it rendered before this ran:
--
--   body_doc  the article as a rich text document, once it has been through
--             the editor. `body` stays as it is - it is the field of record
--             for every post written before the editor existed, and the page
--             renders whichever is present. Nothing is converted on the way
--             in, so a post nobody re-opens is a post nobody can break.
--
--   sections  the marketplace block, the FAQs, what follows the article and
--             the closing call to action. Empty means "use the defaults in
--             code", and those defaults reproduce the old hard-coded page
--             word for word.
--
-- jsonb rather than a column per field because the shape is editorial and will
-- move: the alternative is a migration every time a section gains a line.
-- Nothing queries inside either column, so there is no index to justify.
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists body_doc jsonb,
  add column if not exists sections jsonb not null default '{}'::jsonb;

comment on column public.posts.body_doc is
  'Rich text document from the editor. Null means the markdown in body is the article.';

comment on column public.posts.sections is
  'Marketplace block, FAQs, related mode and closing CTA. Empty uses the defaults in code.';
