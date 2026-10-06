\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- Saved sites, and the suggestion cache.
--
-- A project is the one thing in the gap finder a customer owns and writes, so
-- it is the one place a customer-facing policy exists at all - and the only
-- place where `with check` matters as much as `using`. Without that second
-- half a customer could update somebody else's row to point at their own
-- account, which reads as a working policy right up until somebody tries it.
-- ---------------------------------------------------------------------------

insert into public.profiles (id, email, full_name, role)
values ('33333333-3333-3333-3333-333333333333', 'buyer@agency.test', 'Buyer', 'customer')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role)
values ('44444444-4444-4444-4444-444444444444', 'other@agency.test', 'Other', 'customer')
on conflict (id) do nothing;

-- ---------------------------------------------- one project per site each --
insert into public.gap_projects (id, user_id, name, domain, competitor_domains, country)
values (
  '66666666-6666-6666-6666-666666666666',
  '33333333-3333-3333-3333-333333333333',
  'Acme Ltd', 'acme.test', array['rival-a.test', 'rival-b.test'], 'gb'
) on conflict (user_id, domain) do nothing;

/*
  Saving the same site twice is an edit, not a second row.

  Two rows for one client is two sets of competitors drifting apart, and the
  stale one is always the one somebody runs. The constraint is what makes the
  service's upsert an edit rather than a refusal.
*/
insert into public.gap_projects (user_id, name, domain, competitor_domains)
values ('33333333-3333-3333-3333-333333333333', 'Acme again', 'acme.test', array['rival-c.test'])
on conflict (user_id, domain) do update set competitor_domains = excluded.competitor_domains;

select 'the same site twice is one project: ' ||
  (select count(*) = 1 from public.gap_projects
   where user_id = '33333333-3333-3333-3333-333333333333' and domain = 'acme.test');
select 'and the newer competitors won: ' ||
  (select competitor_domains = array['rival-c.test'] from public.gap_projects
   where id = '66666666-6666-6666-6666-666666666666');

-- Two customers may each hold the same domain. The constraint is per account,
-- because an agency and its client's in-house team are different accounts
-- working on the same site.
insert into public.gap_projects (user_id, name, domain)
values ('44444444-4444-4444-4444-444444444444', 'Same site, other agency', 'acme.test')
on conflict (user_id, domain) do nothing;
select 'two accounts may each hold one site: ' ||
  (select count(*) = 2 from public.gap_projects where domain = 'acme.test');

-- -------------------------------------------- a run remembers its project --
insert into public.gap_runs (id, user_id, project_id, target_domain, status)
values (
  '77777777-7777-7777-7777-777777777777',
  '33333333-3333-3333-3333-333333333333',
  '66666666-6666-6666-6666-666666666666',
  'acme.test', 'completed'
) on conflict (id) do nothing;

select 'a run remembers its project: ' ||
  (select count(*) = 1 from public.gap_runs
   where id = '77777777-7777-7777-7777-777777777777'
     and project_id = '66666666-6666-6666-6666-666666666666');

/*
  Deleting a project does not delete its reports.

  `on delete set null` rather than cascade: the report is a thing the customer
  ran and may still be working through, and tidying up a client list is not a
  request to destroy the work done for them.
*/
delete from public.gap_projects where user_id = '44444444-4444-4444-4444-444444444444';
delete from public.gap_projects where id = '66666666-6666-6666-6666-666666666666';
select 'removing a saved site keeps its reports: ' ||
  (select count(*) = 1 from public.gap_runs
   where id = '77777777-7777-7777-7777-777777777777');
select 'and the report simply forgets the project: ' ||
  (select project_id is null from public.gap_runs
   where id = '77777777-7777-7777-7777-777777777777');

-- ------------------------------------------------------- the ledger's kind --
-- A suggestion and a referring-domain pull both count against the budget, and
-- the sum must not care which is which. Only the breakdown does.
insert into public.gap_lookups (target, rows_returned, units_charged, kind)
values ('acme.test', 12, 50, 'competitors');
insert into public.gap_lookups (target, rows_returned, units_charged)
values ('acme.test', 2500, 2500);

select 'a pull defaults to the refdomains kind: ' ||
  (select count(*) = 1 from public.gap_lookups
   where target = 'acme.test' and units_charged = 2500 and kind = 'refdomains');
select 'a suggestion is fifty units against the same budget: ' ||
  (select count(*) = 1 from public.gap_lookups
   where target = 'acme.test' and kind = 'competitors' and units_charged = 50);

do $$
begin
  insert into public.gap_lookups (target, units_charged, kind) values ('acme.test', 1, 'guesses');
  raise notice 'an unknown ledger kind is accepted: allowed';
exception
  when check_violation then raise notice 'an unknown ledger kind is refused: true';
end;
$$;

-- ------------------------------------------------------- who reads whose --
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

insert into public.gap_projects (user_id, name, domain)
values ('33333333-3333-3333-3333-333333333333', 'Mine', 'mine-own.test')
on conflict (user_id, domain) do nothing;
select 'a customer may save their own site: ' ||
  (select count(*) = 1 from public.gap_projects where domain = 'mine-own.test');

/*
  The `with check` half, which is the one that is easy to leave out.

  `using` alone would let this through: the row being updated is theirs, so the
  policy passes - and the row afterwards belongs to somebody else, which is a
  project handed away rather than one read without permission.
*/
do $$
begin
  update public.gap_projects
    set user_id = '44444444-4444-4444-4444-444444444444'
    where domain = 'mine-own.test';

  /*
    Asked of the owner, not of the row.

    "The row is still there" is true whether the update was refused or
    succeeded - the domain is unchanged either way - so that version of this
    check passes with no policy at all. The question is who owns it now, and
    only the service role can see the answer once a customer has given it away.
  */
  if exists (
    select 1 from public.gap_projects
    where domain = 'mine-own.test'
      and user_id = '33333333-3333-3333-3333-333333333333'
  ) then
    raise notice 'a customer cannot reassign their own project: true';
  else
    raise notice 'a customer gave their project away: ALLOWED';
  end if;
exception
  when insufficient_privilege then
    -- The expected path: `using` lets the row through because it is theirs,
    -- and `with check` refuses the row it would become.
    raise notice 'a customer cannot reassign their own project: true (refused by the with check)';
end;
$$;

reset role; reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select 'another customer sees no saved sites of theirs: ' ||
  count(*) from public.gap_projects where domain = 'mine-own.test';

do $$
begin
  insert into public.gap_projects (user_id, name, domain)
  values ('33333333-3333-3333-3333-333333333333', 'Theirs', 'planted.test');
  raise notice 'a customer may plant a project on somebody else: allowed';
exception
  when insufficient_privilege then
    raise notice 'a customer cannot plant a project on somebody else: true';
end;
$$;

-- The suggestion cache holds what Ahrefs charged us. Internal on the same
-- terms as refdomain_snapshots: the customer sees the suggestions through the
-- service role, never the bill.
select 'a customer reads the suggestion cache: ' ||
  count(*) from public.competitor_suggestions;
reset role; reset request.jwt.claim.sub;

set role anon;
select 'anon reads saved sites: ' || count(*) from public.gap_projects;
select 'anon reads the suggestion cache: ' || count(*) from public.competitor_suggestions;
reset role;
