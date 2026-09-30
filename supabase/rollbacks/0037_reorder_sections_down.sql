-- Rollback for 0037_reorder_sections.
--
-- Drops the reorder function. Pages keep whatever order they were last left
-- in - positions are columns, not something this function owns - but the
-- admin's reorder stops working until it is back.

drop function if exists public.reorder_page_sections(text, uuid[]);
