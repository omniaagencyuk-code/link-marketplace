-- ---------------------------------------------------------------------------
-- 0080  What the homepage category reads actually cost
--
-- 0079 recorded `input_tokens` and `output_tokens` per read, and the
-- Categorise screen is about to show their total. Two problems with doing
-- that against the columns as they stand.
--
-- ## The figure is an undercount, and the shape of the mistake is familiar
--
-- `niche-client.ts` puts a cache breakpoint after the rules block, because
-- the rules are byte-identical on every call and paying for them 1,840 times
-- is the thing the breakpoint exists to avoid. The API then reports that
-- prefix in its own fields - `cache_creation_input_tokens` on the call that
-- writes it, `cache_read_input_tokens` on the ones that reuse it - and
-- `input_tokens` counts neither. So the rules, which are the larger half of
-- every request, have been recorded as costing nothing at all.
--
-- This is `COLUMNS_CHARGED` again: the ledger was right, every estimate made
-- against it was wrong, and nothing said so. A spend line is the one place
-- that is not survivable, because a spend line's entire job is to be the
-- number somebody budgets against.
--
-- So two more columns, and the three buckets are priced apart rather than
-- added together: a cache write bills at about 1.25x the input rate and a
-- cache read at about 0.1x. Folding reads into `input_tokens` - which the
-- Sales Centre's three callers do - is the opposite error and overstates
-- them tenfold. Neither is measured.
--
-- ## And summing it by reading every row is the wrong shape
--
-- The backlog is 1,840 listings. Totalling four integers across all of them
-- in JavaScript means fetching all of them to render one line of text, which
-- is the mistake 0069 through 0074 each existed to undo.
--
-- `category_read_spend` returns the sums, grouped by model. Grouped, because
-- `NICHE_MODEL` is overridable and a run made half on Haiku and half on
-- something larger has no single rate - one total priced at one rate would
-- be a figure that is wrong in a way nobody can see. The rates themselves
-- stay in `PRICING` in `client.ts`, which is the only copy.
--
-- `security definer` with the revokes below, like every admin function here:
-- the admin signs in with a shared password and carries no `auth.uid()`, so
-- row level security hands them nothing. What this reads is internal under
-- the terms AGENTS.md sets - what we paid - and has no customer-facing
-- policy to fall back on.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

/*
  Default zero rather than null.

  Every row written before this migration was written by a client that did
  not report these, and the true figure for those rows is unknown rather
  than zero. Null would say so honestly and would also make every sum null
  unless each one remembered `coalesce` - and the rows in question are the
  first few dozen of a backlog of 1,840. Zero understates a handful of
  historic reads; null breaks the arithmetic for all of them.
*/
alter table public.website_category_reads
  add column if not exists cache_write_tokens integer not null default 0;

alter table public.website_category_reads
  add column if not exists cache_read_tokens integer not null default 0;

comment on column public.website_category_reads.cache_write_tokens is
  'cache_creation_input_tokens as the API reported it: the call that wrote the rules prefix into the cache, billed at about 1.25x the input rate.';

comment on column public.website_category_reads.cache_read_tokens is
  'cache_read_input_tokens as the API reported it: the rules prefix served from cache, billed at about 0.1x the input rate. Recorded apart from input_tokens because adding them together prices them at 1x, and leaving them out prices them at nothing.';

create or replace function public.category_read_spend()
returns table (
  model text,
  reads bigint,
  /*
    The reads that actually reached the model.

    A page that would not fetch is recorded as a read - that is the point of
    recording refusals - and it costs nothing, because no call was made. It
    belongs in `reads` and must stay out of any per-read average, or the
    projected cost of working the rest of the backlog is dragged toward zero
    by every parked domain already in it.
  */
  priced_reads bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_write_tokens bigint,
  cache_read_tokens bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.model,
    count(*)::bigint,
    count(*) filter (
      where r.input_tokens > 0 or r.cache_read_tokens > 0 or r.cache_write_tokens > 0
    )::bigint,
    coalesce(sum(r.input_tokens), 0)::bigint,
    coalesce(sum(r.output_tokens), 0)::bigint,
    coalesce(sum(r.cache_write_tokens), 0)::bigint,
    coalesce(sum(r.cache_read_tokens), 0)::bigint
  from public.website_category_reads r
  group by r.model
  order by r.model;
$$;

comment on function public.category_read_spend() is
  'Tokens spent reading publisher homepages for a category, summed per model. Grouped because NICHE_MODEL is overridable and two models have two rates; the rates live in PRICING in client.ts, which is the only copy.';

revoke all on function public.category_read_spend() from public;
revoke all on function public.category_read_spend() from anon;
revoke all on function public.category_read_spend() from authenticated;

/*
  How much of the backlog has already been read.

  Not the same number as `reads`, and the difference is the whole point of
  recording a refusal. A read that was applied took its listing out of the
  backlog, so it is counted in `reads` and is not in the backlog's total. A
  read that found nothing left its listing exactly where it was, so it is in
  both - and re-reading it is precisely what the row exists to prevent.

  Subtracting one from the other is what makes "what the rest would cost" a
  statement about work still to do rather than about work already done.
  `is_admin()` rather than a definer's own judgement would be the pattern if
  this read anything a customer may see; it reads the same internal table as
  the function above, so it carries the same revokes.
*/
create or replace function public.category_reads_on_uncategorised()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.website_category_reads r
  join public.websites w on w.id = r.website_id
  where w.status = 'active'
    and w.primary_category_id is null;
$$;

comment on function public.category_reads_on_uncategorised() is
  'How many still-uncategorised active listings already carry a homepage read. The backlog total minus this is what is left to read, which is not the same as the backlog total minus every read: an applied read left the backlog, a declined one did not.';

revoke all on function public.category_reads_on_uncategorised() from public;
revoke all on function public.category_reads_on_uncategorised() from anon;
revoke all on function public.category_reads_on_uncategorised() from authenticated;
