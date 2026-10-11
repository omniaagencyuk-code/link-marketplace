\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- What the homepage reads cost, and what is left to read.
--
-- Three things, and the middle one is the reason the file exists.
--
-- The columns: a cache write and a cache read are recorded apart from
-- `input_tokens` because they are priced apart - 1.25x and a tenth. 0080
-- says why folding them either way is a mistake big enough to see in a
-- budget.
--
-- `priced_reads`: a page that would not load is a recorded read and a real
-- outcome, and it cost nothing because no call was made. If it counted
-- toward the average, the projected cost of the rest of the backlog would be
-- dragged toward zero by every parked domain already in it - and the figure
-- would get *better* the more dead sites were found, which is the kind of
-- wrong nobody questions.
--
-- `category_reads_on_uncategorised`: not the same number as the row count,
-- and the difference is the whole point of recording a refusal. An applied
-- read took its listing out of the backlog; a declined read left it there.
--
-- Everything is asserted as a delta. These files share one database, and 31
-- has already put rows in this table - a test that asserted absolute totals
-- would pass today and break the first time somebody added a row above it.
-- ---------------------------------------------------------------------------

create temporary table spend_before as
  select coalesce(sum(reads), 0) as reads,
         coalesce(sum(priced_reads), 0) as priced_reads,
         coalesce(sum(input_tokens), 0) as input_tokens,
         coalesce(sum(output_tokens), 0) as output_tokens,
         coalesce(sum(cache_write_tokens), 0) as cache_write_tokens,
         coalesce(sum(cache_read_tokens), 0) as cache_read_tokens
  from public.category_read_spend();

create temporary table backlog_before as
  select public.category_reads_on_uncategorised() as n;

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values
  ('crs-priced', 'zqcrs-priced.test', 'CRS Priced', 'active', 'GB', 'stated', 'en'),
  ('crs-free', 'zqcrs-free.test', 'CRS Free', 'active', 'GB', 'stated', 'en'),
  ('crs-done', 'zqcrs-done.test', 'CRS Done', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

-- Already categorised, and its read already applied: out of the backlog.
update public.websites
   set primary_category_id = (select id from public.categories order by slug limit 1)
 where slug = 'crs-done';

-- ---------------------------------------------------- the columns default

insert into public.website_category_reads
  (website_id, niche, confidence, quote, reason, prompt_version, model, input_tokens, output_tokens)
select w.id, 'sports', 80, 'q', 'r', 'niche-from-homepage-1', 'claude-haiku-5-5', 10, 1
from public.websites w where w.slug = 'crs-priced'
on conflict (website_id) do nothing;

select 'a row written without the cache columns defaults them to zero: ' ||
  (select cache_write_tokens = 0 and cache_read_tokens = 0
   from public.website_category_reads r
   join public.websites w on w.id = r.website_id where w.slug = 'crs-priced');

-- Now give it the figures a cached call would actually report.
update public.website_category_reads
   set input_tokens = 1200, output_tokens = 90,
       cache_write_tokens = 0, cache_read_tokens = 1150
 where website_id = (select id from public.websites where slug = 'crs-priced');

-- A page that would not load: a read, and no tokens at all.
insert into public.website_category_reads
  (website_id, niche, confidence, declined_because, reason, prompt_version, model,
   input_tokens, output_tokens, cache_write_tokens, cache_read_tokens)
select w.id, null, null, 'could-not-read-the-page', 'HTTP 404',
       'niche-from-homepage-1', 'claude-haiku-5-5', 0, 0, 0, 0
from public.websites w where w.slug = 'crs-free'
on conflict (website_id) do nothing;

-- An applied read on a listing that now has a category.
insert into public.website_category_reads
  (website_id, niche, confidence, quote, reason, prompt_version, model,
   input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, applied_at, applied_by)
select w.id, 'finance', 91, 'q', 'r', 'niche-from-homepage-1', 'claude-haiku-5-5',
       800, 40, 1150, 0, timezone('utc', now()), 'tester'
from public.websites w where w.slug = 'crs-done'
on conflict (website_id) do nothing;

-- ------------------------------------------------------------- the sums

create temporary table spend_after as
  select coalesce(sum(reads), 0) as reads,
         coalesce(sum(priced_reads), 0) as priced_reads,
         coalesce(sum(input_tokens), 0) as input_tokens,
         coalesce(sum(output_tokens), 0) as output_tokens,
         coalesce(sum(cache_write_tokens), 0) as cache_write_tokens,
         coalesce(sum(cache_read_tokens), 0) as cache_read_tokens
  from public.category_read_spend();

select 'three more reads are counted: ' ||
  ((select reads from spend_after) - (select reads from spend_before) = 3);

/*
  Two of the three, not three. The unfetchable page is a read and is not a
  priced one - this is the assertion that stops a backlog full of parked
  domains reporting itself as nearly free to finish.
*/
select 'but only two of them reached the model: ' ||
  ((select priced_reads from spend_after) - (select priced_reads from spend_before) = 2);

select 'the input tokens are summed: ' ||
  ((select input_tokens from spend_after) - (select input_tokens from spend_before) = 2000);

select 'the output tokens are summed: ' ||
  ((select output_tokens from spend_after) - (select output_tokens from spend_before) = 130);

/*
  Separately, and this is what 0080 added. One call wrote the rules prefix
  into the cache and one read it back; summed together they would be 2,300
  tokens at one rate, and the two rates differ by more than twelve times.
*/
select 'the cache writes are summed on their own: ' ||
  ((select cache_write_tokens from spend_after) - (select cache_write_tokens from spend_before) = 1150);

select 'and so are the cache reads: ' ||
  ((select cache_read_tokens from spend_after) - (select cache_read_tokens from spend_before) = 1150);

-- --------------------------------------------- what is left of the backlog

/*
  Two of the three listings are still uncategorised and carry a read. The
  third was applied and has a category, so it has left the backlog and must
  not be counted against it - otherwise "the remaining N" shrinks by work
  already finished as well as by work still to do, and the projection
  undercounts by exactly the number of successes.
*/
select 'a declined read still counts against the backlog, an applied one does not: ' ||
  (public.category_reads_on_uncategorised() - (select n from backlog_before) = 2);

-- ------------------------------------------------------------- who may ask

/*
  Both functions are `security definer` over a table with no customer-facing
  policy, so the revokes are the only thing standing between a signed-in
  customer and what we paid. Asked as both roles, because "no grant" and "a
  grant nobody noticed" look identical until somebody asks.

  The succeeds-as-owner check below is not decoration: without it, a
  function that was dropped, renamed or broken would make every refusal here
  pass for the wrong reason.
*/
do $$
declare
  r text;
  v_refused boolean;
  v_n bigint;
begin
  foreach r in array array['anon', 'authenticated'] loop
    v_refused := false;
    begin
      execute format('set local role %I', r);
      perform * from public.category_read_spend();
    exception when others then v_refused := true;
    end;
    reset role;
    raise notice '% cannot read the spend: %', r, v_refused;

    v_refused := false;
    begin
      execute format('set local role %I', r);
      select public.category_reads_on_uncategorised() into v_n;
    exception when others then v_refused := true;
    end;
    reset role;
    raise notice '% cannot read what is left: %', r, v_refused;
  end loop;

  perform * from public.category_read_spend();
  select public.category_reads_on_uncategorised() into v_n;
  raise notice 'and both answer for the owner, so the refusals above mean something: %', v_n >= 2;
end;
$$;
