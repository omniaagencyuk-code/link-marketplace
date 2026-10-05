-- ---------------------------------------------------------------------------
-- 0050  How many keywords a listing ranks for
--
-- The number of keywords a site ranks for in the top 100 organic results. A
-- site ranking for two hundred keywords and one ranking for three are visibly
-- different propositions, and nothing on a marketplace card told them apart.
--
-- ## It costs nothing to collect
--
-- `org_keywords` is a column on the batch-analysis call the nightly refresh
-- already makes. Measured against the live API: the current six-column select
-- costs 90 units per domain, and the same select with the keyword columns
-- added costs 90 units per domain. Ahrefs prices that endpoint by metric
-- group rather than by column, and `org_traffic` has already paid for the
-- organic group.
--
-- This is the same shape of omission as `refdomains` in 0043: a figure we were
-- already entitled to, simply never asked for.
--
-- The actual keyword *phrases* are a different endpoint charged per keyword
-- row - twelve units each, measured - and are deliberately not collected here.
-- Fifty phrases per domain across the inventory would cost more than the
-- monthly allowance.
--
-- ## Null is not zero
--
-- Nullable on purpose, like `trust_flow` and `spam_score` beside it. A listing
-- Ahrefs has no reading for must not render as "ranks for 0 keywords", which
-- is a claim about the site rather than about our data. The card shows a dash.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

alter table public.websites
  add column if not exists organic_keywords integer
    check (organic_keywords is null or organic_keywords >= 0);

comment on column public.websites.organic_keywords is
  'Keywords the site ranks for in the top 100 organic results, from the Ahrefs refresh. Null means never measured, which is not the same as zero.';

-- Buyers will want to sort and filter on it the way they do on referring
-- domains, and that column has an index for exactly that reason.
create index if not exists websites_organic_keywords_idx
  on public.websites (organic_keywords desc nulls last);
