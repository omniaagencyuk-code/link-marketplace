\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Publishing the backlog.
--
-- The SQL side only finds candidates: a draft with a placement that is
-- switched on and priced. That is the cheap half of `publishBlocker` - the
-- `unpriced` and `priced-but-off` cases. The expensive half, whether a
-- placement sells at or below what we pay the publisher, needs the converted
-- cost and the rate card and stays in TypeScript, where the engine's
-- arithmetic already lives.
--
-- So what is worth asserting here is the narrowing, and especially what it
-- must NOT offer: anything already live, anything priced at zero, anything
-- priced but switched off.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code)
values
  ('pub-ready',      'pub-ready.test',      'Ready',       'draft',  'GB', 'stated', 'en'),
  ('pub-unpriced',   'pub-unpriced.test',   'Unpriced',    'draft',  'GB', 'stated', 'en'),
  ('pub-off',        'pub-off.test',        'Switched off','draft',  'GB', 'stated', 'en'),
  ('pub-nothing',    'pub-nothing.test',    'No services', 'draft',  'GB', 'stated', 'en'),
  ('pub-live',       'pub-live.test',       'Already live','active', 'GB', 'stated', 'en'),
  ('pub-archived',   'pub-archived.test',   'Archived',    'archived','GB','stated', 'en')
on conflict (slug) do nothing;

insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 19500, true from public.websites where slug = 'pub-ready'
on conflict (website_id, type) do nothing;

-- Priced at zero, which is how a listing arrives from the publisher inbox:
-- we know what it costs us, we do not know what we charge.
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 0, true from public.websites where slug = 'pub-unpriced'
on conflict (website_id, type) do nothing;

-- Priced, but nothing can be bought.
insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 19500, false from public.websites where slug = 'pub-off'
on conflict (website_id, type) do nothing;

insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 25000, true from public.websites where slug = 'pub-live'
on conflict (website_id, type) do nothing;

insert into public.services (website_id, type, price_minor, available)
select id, 'guest-post', 25000, true from public.websites where slug = 'pub-archived'
on conflict (website_id, type) do nothing;

select 'a priced, switched-on draft is a candidate: ' ||
  (select count(*) = 1 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-ready');

select 'a listing priced at zero is not: ' ||
  (select count(*) = 0 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-unpriced');

select 'nor one whose only placement is switched off: ' ||
  (select count(*) = 0 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-off');

select 'nor one with no placements at all: ' ||
  (select count(*) = 0 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-nothing');

/*
  Only drafts.

  A run that offered live listings would churn them for nothing; one that
  offered archived listings would quietly bring back inventory somebody
  deliberately retired.
*/
select 'a listing already live is not offered again: ' ||
  (select count(*) = 0 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-live');

select 'nor is an archived one: ' ||
  (select count(*) = 0 from public.website_publish_candidates(100, '{}') c
   join public.websites w on w.id = c.id where w.slug = 'pub-archived');

/*
  The exclusion list is what stops the run looping.

  A listing the run refuses stays a draft and would be a candidate again on
  the next slice. Without this the run hands itself the same unpublishable
  listing for ever and never reaches the end of the queue - the same failure
  the approve-all run had to be built against.
*/
select 'an excluded listing is not offered again: ' ||
  (select count(*) = 0
   from public.website_publish_candidates(
     100,
     array(select id from public.websites where slug = 'pub-ready')
   ) c
   join public.websites w on w.id = c.id where w.slug = 'pub-ready');

select 'the count agrees with the candidate list: ' ||
  (select public.website_publish_eligible_count()
          = (select count(*)::integer from public.website_publish_candidates(100000, '{}')));

-- ------------------------------------------------------------- the run row

insert into public.website_publish_runs (total, started_by) values (5, 'tester');

select 'a run can be claimed: ' ||
  (select public.claim_website_publish_run(600) is not null);

select 'but not twice before it goes stale: ' ||
  (select public.claim_website_publish_run(600) is null);

select 'claiming counts a tick: ' ||
  (select ticks = 1 from public.website_publish_runs where started_by = 'tester');

update public.website_publish_runs set status = 'finished' where started_by = 'tester';
select 'a finished run is not claimed at all: ' ||
  (select public.claim_website_publish_run(600) is null);

-- ------------------------------------------------- who may call these at all

do $$
declare
  fn text;
  v_refused boolean;
begin
  foreach fn in array array[
    'select * from public.website_publish_candidates(1, ''{}'')',
    'select public.website_publish_eligible_count()',
    'select public.claim_website_publish_run(600)'
  ] loop
    v_refused := false;
    begin
      set local role anon;
      execute fn;
    exception when insufficient_privilege then
      v_refused := true;
    end;
    reset role;
    raise notice 'anon is refused: % -> %', left(fn, 48), v_refused;
  end loop;
end;
$$;

select 'the runs table is internal, with no customer-facing policy: ' ||
  (select count(*) = 0 from pg_policies
   where schemaname = 'public' and tablename = 'website_publish_runs'
     and policyname not ilike '%admin%');
