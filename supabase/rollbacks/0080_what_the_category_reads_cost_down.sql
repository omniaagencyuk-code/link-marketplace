-- ---------------------------------------------------------------------------
-- Undo 0080  What the homepage category reads cost
--
-- DESTROYS the per-read record of cached tokens - how much of each request
-- was the rules prefix written into the cache, and how much was served from
-- it. The reads themselves, their proposals and their `input_tokens` and
-- `output_tokens` all survive; what goes is the half of the input that
-- `input_tokens` never counted.
--
-- Copy it out first if the spend figure matters:
--
--   select website_id, model, cache_write_tokens, cache_read_tokens
--     from public.website_category_reads
--    where cache_write_tokens > 0 or cache_read_tokens > 0;
--
-- The cost is the spend line on /admin/categorise, which fails outright
-- against a missing function rather than quietly falling back to the
-- undercount 0080 exists to fix. On a figure somebody budgets against, that
-- is the only acceptable failure.
-- ---------------------------------------------------------------------------

drop function if exists public.category_read_spend();

alter table public.website_category_reads
  drop column if exists cache_write_tokens;

alter table public.website_category_reads
  drop column if exists cache_read_tokens;
