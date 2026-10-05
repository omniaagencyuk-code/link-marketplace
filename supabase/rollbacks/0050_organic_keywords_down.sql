-- ---------------------------------------------------------------------------
-- Undo 0050.
--
-- DESTROYS: the keyword count on every listing. Not expensive to lose - the
-- next Ahrefs refresh collects it again at no extra cost, because it is a
-- column on a request that is made anyway - but every listing reads as
-- unmeasured until that refresh reaches it, which on tier 3 is up to a month.
--
-- Only run this alongside code that does not select `org_keywords`. The
-- refresh writing a column that no longer exists fails the whole update, which
-- would take domain rating and traffic down with it.
-- ---------------------------------------------------------------------------

drop index if exists public.websites_organic_keywords_idx;

alter table public.websites drop column if exists organic_keywords;
