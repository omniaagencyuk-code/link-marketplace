\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- What reading a homepage recorded, and who may read it.
--
-- Two things worth asserting, and they are different in kind.
--
-- The policy: this table holds what a model thought and what the call cost.
-- Both are internal on the terms AGENTS.md sets, so it has an admin policy
-- and no customer-facing one at all. The check below asks as `anon` and as
-- `authenticated`, because "no policy" and "a policy nobody noticed" look
-- identical until somebody asks.
--
-- The constraint: a row says either what it found or why it found nothing.
-- Without it the table grows rows that are neither a proposal nor a refusal,
-- and the screen has no way to render them - which is how a site comes to be
-- read over and over because nothing recorded that it had been.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values ('cr-one', 'zqcatread-one.test', 'Cat Read One', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

-- ------------------------------------------------------- the source column

select 'a listing starts with no recorded category source: ' ||
  (select primary_category_source is null from public.websites where slug = 'cr-one');

do $$
declare
  v_refused boolean := false;
begin
  update public.websites set primary_category_source = 'guessed' where slug = 'cr-one';
exception
  when check_violation then v_refused := true;
end;
$$;

select 'a source we do not recognise is refused: ' ||
  (select primary_category_source is distinct from 'guessed'
   from public.websites where slug = 'cr-one');

update public.websites set primary_category_source = 'homepage' where slug = 'cr-one';
select 'and one we do is kept: ' ||
  (select primary_category_source = 'homepage' from public.websites where slug = 'cr-one');

-- -------------------------------------------------- a row is one or the other

/*
  A proposal: a category, and no reason for not having one.
*/
insert into public.website_category_reads
  (website_id, niche, confidence, quote, reason, prompt_version, model, input_tokens, output_tokens)
select w.id, 'sports', 88, 'Match reports and transfer rumours', 'Every headline is a match report.',
       'niche-from-homepage-1', 'claude-haiku-5-5', 2400, 55
from public.websites w where w.slug = 'cr-one'
on conflict (website_id) do nothing;

select 'a proposal is stored: ' ||
  (select count(*) = 1 from public.website_category_reads r
   join public.websites w on w.id = r.website_id
   where w.slug = 'cr-one' and r.niche = 'sports' and r.declined_because is null);

select 'and it is not applied until somebody applies it: ' ||
  (select applied_at is null from public.website_category_reads r
   join public.websites w on w.id = r.website_id where w.slug = 'cr-one');

/*
  Both at once is not a state. Nor is neither.
*/
do $$
declare
  v_both boolean := false;
  v_neither boolean := false;
begin
  begin
    update public.website_category_reads set declined_because = 'model-said-unknown'
    where website_id = (select id from public.websites where slug = 'cr-one');
  exception when check_violation then v_both := true;
  end;

  begin
    update public.website_category_reads set niche = null, declined_because = null
    where website_id = (select id from public.websites where slug = 'cr-one');
  exception when check_violation then v_neither := true;
  end;

  raise notice 'a row cannot be a proposal and a refusal at once: %', v_both;
  raise notice 'and cannot be neither: %', v_neither;
end;
$$;

-- A refusal on its own is a legitimate row, and the reason it exists: without
-- it the next run fetches the same parked domain again.
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values ('cr-two', 'zqcatread-two.test', 'Cat Read Two', 'active', 'GB', 'stated', 'en')
on conflict (slug) do nothing;

insert into public.website_category_reads
  (website_id, niche, confidence, declined_because, reason, prompt_version, model)
select w.id, null, null, 'could-not-read-the-page', 'HTTP 404',
       'niche-from-homepage-1', 'claude-haiku-5-5'
from public.websites w where w.slug = 'cr-two'
on conflict (website_id) do nothing;

select 'a read that found nothing is recorded too: ' ||
  (select count(*) = 1 from public.website_category_reads r
   join public.websites w on w.id = r.website_id
   where w.slug = 'cr-two' and r.niche is null and r.declined_because = 'could-not-read-the-page');

-- A confidence outside 0-100 is not a confidence.
do $$
declare
  v_refused boolean := false;
begin
  update public.website_category_reads set confidence = 140
  where website_id = (select id from public.websites where slug = 'cr-one');
exception when check_violation then v_refused := true;
end;
$$;

select 'a confidence above a hundred is refused: ' ||
  (select confidence <= 100 from public.website_category_reads r
   join public.websites w on w.id = r.website_id where w.slug = 'cr-one');

-- ------------------------------------------------------------- who may read

/*
  Internal, on the terms AGENTS.md sets for `service_costs` and
  `website_commercials`: an admin policy and no customer-facing one. A
  signed-in customer is a customer, so the check asks as both roles rather
  than assuming one stands for the other.
*/
do $$
declare
  r text;
  v_rows integer;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    select count(*) into v_rows from public.website_category_reads;
    reset role;
    raise notice '% reads nothing from the homepage reads: %', r, v_rows = 0;
  end loop;
end;
$$;

/*
  The id is resolved before the role changes, and that is the whole point.

  Written as `insert ... select w.id from public.websites where slug = ...`
  this passed for `authenticated` and failed for `anon` - not because anon
  could write, but because anon cannot read `websites` at all, so the select
  returned no rows and an insert of nothing raises nothing. A refusal check
  that inserts zero rows asserts that zero rows are hard to insert.

  Taking the id first means both roles attempt a real row.
*/
do $$
declare
  r text;
  v_refused boolean;
  v_id uuid;
begin
  select id into v_id from public.websites where slug = 'cr-two';

  foreach r in array array['anon', 'authenticated'] loop
    v_refused := false;
    begin
      execute format('set local role %I', r);
      insert into public.website_category_reads
        (website_id, niche, confidence, prompt_version, model)
      values (v_id, 'finance', 90, 'x', 'y');
    exception when others then v_refused := true;
    end;
    reset role;
    raise notice '% cannot write one: %', r, v_refused;
  end loop;
end;
$$;
