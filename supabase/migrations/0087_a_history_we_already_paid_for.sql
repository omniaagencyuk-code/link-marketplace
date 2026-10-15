-- A traffic history built from readings the refresh already takes.
--
-- `websites.traffic_trend` has existed since 0001 and has been empty since
-- 0001: the CSV importer writes an empty array and the Ahrefs refresh never
-- wrote the column at all, so every listing's Traffic Trend panel reads
-- "Not recorded". Meanwhile every refresh asks Ahrefs for `org_traffic`,
-- overwrites `organic_traffic` with it, and discards the reading.
--
-- Buying the history instead was measured against the free `ahrefs.com`
-- target: `select=date,org_traffic` is 11 units a row, so 143 units for one
-- domain's thirteen monthly rows, and `metrics-history` takes one target per
-- call where the refresh batches a hundred. 12,190 active listings is 1.74
-- million units a pass against a two million unit monthly allowance.
--
-- So the refresh keeps what it already has. This column is the only thing it
-- needs to do that: which calendar month the last element of `traffic_trend`
-- belongs to, so a second reading in the same month replaces that month's
-- figure instead of appending a point. Without it a listing refreshed weekly
-- would build a series four times faster than one refreshed monthly, and
-- neither array would mean anything.
--
-- Null means no reading has been bucketed yet, which is every row today. A
-- row with points and no month is treated as unidentifiable and appended to
-- rather than overwritten - see `appendReading` in src/lib/ahrefs/trend.ts.
--
-- Not internal: `traffic_trend` is already a customer-visible column and the
-- month its newest reading was taken in says nothing more. It carries no
-- cost, no contact and no commercial term, so it belongs here rather than in
-- a table of its own.

alter table public.websites
  add column if not exists traffic_trend_month date;

comment on column public.websites.traffic_trend_month is
  'The calendar month (first of the month) that the last element of traffic_trend was measured in. Null until the refresh has recorded a reading. The refresh replaces the last element when a new reading falls in this same month, and appends otherwise, so the series is one point per month however often the listing is refreshed. Consecutive months are not guaranteed: a listing nobody refreshed in a given month simply has no reading for it, and nothing should label the array as a continuous run of months.';
