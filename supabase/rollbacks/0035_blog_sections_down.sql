-- Rollback for 0035_blog_sections.
--
-- Drops both columns. Anything typed into the editor after 0035 ran is lost
-- with them: `body_doc` holds articles that have no markdown equivalent, and
-- `sections` holds every FAQ and every edited call to action. The posts
-- themselves survive - `body`, which was never touched, is still there - so a
-- post written before 0035 comes back whole and one written after it comes
-- back as whatever markdown it happened to carry.

alter table public.posts
  drop column if exists body_doc,
  drop column if exists sections;
