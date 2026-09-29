-- ============================================================================
-- Rollback 0033  Trust Flow, Citation Flow and topics
-- ============================================================================
-- Drops the topics table and the three columns, which takes every measurement
-- with them. That is safe in a way most rollbacks are not: nothing here was
-- typed by a person, and re-importing the same Majestic export restores all
-- of it.
--
-- The three categories are removed only where nothing is using them. A
-- listing already filed under News & Media would lose its category to a
-- cascade, so the delete is refused for that slug instead and says so.
-- ============================================================================

drop table if exists public.website_topics;

drop index if exists public.websites_trust_flow_idx;

alter table public.websites
  drop column if exists trust_flow,
  drop column if exists citation_flow,
  drop column if exists majestic_updated_at;

-- Only the unused ones. `website_categories` is the join a listing sits in.
delete from public.categories c
where c.slug in ('news-media', 'science-environment', 'education')
  and not exists (
    select 1 from public.website_categories wc where wc.category_id = c.id
  )
  and not exists (
    select 1 from public.websites w where w.primary_category_id = c.id
  );
