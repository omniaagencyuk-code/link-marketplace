-- ---------------------------------------------------------------------------
-- Undo 0043.
--
-- DESTROYS: every country the backfill worked out. A market set from a traffic
-- breakdown or from the domain's own suffix is overwritten with 'GB', because
-- that is the value 0043 found there and the column cannot be null again.
-- Countries an administrator set by hand since 0043 ran are overwritten too -
-- there is no record of which rows those were.
--
-- Nothing else in the application needs this. The code reads a null country as
-- "not stated" and a backfilled one as stated, and neither depends on the
-- column being `not null`. Run it only to get the schema back to where it was.
-- ---------------------------------------------------------------------------

-- Everything unknown becomes British again, which is the state 0043 fixed.
update public.websites set country_code = 'GB' where country_code is null;

alter table public.websites alter column country_code type char(2);
alter table public.websites alter column country_code set not null;

select count(*) as listings_now_claiming_gb
from public.websites
where country_code = 'GB';
