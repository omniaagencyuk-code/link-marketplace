-- Undo 0087.
--
-- Dropping the column loses the month marker but not the series: the readings
-- in `traffic_trend` stay where they are. What a re-applied 0087 then sees is
-- a row with points and a null month, which `appendReading` handles by
-- appending rather than replacing - so the worst case is one month holding
-- two readings, not a corrupted series.
--
-- The refresh writes this column, so take the code back before the schema, or
-- every refresh between the two logs an error on an unknown column.

alter table public.websites
  drop column if exists traffic_trend_month;
