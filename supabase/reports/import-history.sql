/*
  Every CSV import ever recorded, in one row. Read-only.

  The companion to duplicate-listings.sql, which lists only the runs that
  recorded failures. That report showing nothing is two different findings
  wearing the same face: every import was clean, or no import was ever run.
  This tells them apart, and the number that does it is `runs_recorded`.

  It matters because of what the capped domain index could and could not
  damage. The index only decides create-or-update. A CSV row for a domain we
  do not have is a create either way - a missing index entry and an empty
  index look identical for a new domain - so an import that only added sites
  could not have been harmed by the cap however large the marketplace was.
  Only a row updating a listing already past the index's first thousand
  could, and then it failed rather than updating.

  So: no failures across real runs means the cap never bit. No runs at all
  means the marketplace was filled some other way and this was never the
  exposure to begin with.
*/
select
  count(*)                              as runs_recorded,
  coalesce(sum(total_rows), 0)          as rows_seen,
  coalesce(sum(created), 0)             as listings_created,
  coalesce(sum(updated), 0)             as listings_updated,
  coalesce(sum(skipped), 0)             as rows_skipped,
  coalesce(sum(failed), 0)              as rows_failed,
  min(created_at)::date                 as first_import,
  max(created_at)::date                 as last_import
from public.import_runs;
