\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- The Link Building Planner: who can read it, and what it refuses to store.
--
-- This table holds the most commercially sensitive thing a customer of a
-- link marketplace can hand the marketplace: which suppliers they use, what
-- they pay them, which clients they work for and their notes about all of
-- it. So the policy checks here are not a formality - they are the feature.
--
-- Three kinds of assertion, and the middle one is the one worth having.
--
-- Visibility: anon sees nothing, and - the part a single-customer test would
-- miss entirely - one signed-in customer sees nothing of another's.
--
-- `with check`: a customer cannot hand a row to somebody else, or file one
-- under somebody else's project. A policy with `using` alone reads as
-- working right up until somebody writes a different `user_id` into it,
-- which is the hole AGENTS.md records against `gap_projects`.
--
-- Shape: blank is not zero, a month is the first of a month, a status in use
-- cannot be deleted out from under its links.
-- ---------------------------------------------------------------------------

/* `profiles.id` references `auth.users`, so the account has to exist there
   first. Without this the whole fixture fails and every "sees nothing"
   check below passes because there is nothing to see - which is how a
   policy test comes to assert that an empty table is well protected. */
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'planner-a@agency.test'),
  ('b2222222-2222-2222-2222-222222222222', 'planner-b@agency.test')
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role)
values ('a1111111-1111-1111-1111-111111111111', 'planner-a@agency.test', 'Agency A', 'customer')
on conflict (id) do nothing;
insert into public.profiles (id, email, full_name, role)
values ('b2222222-2222-2222-2222-222222222222', 'planner-b@agency.test', 'Agency B', 'customer')
on conflict (id) do nothing;

insert into public.gap_projects (id, user_id, name, domain, country)
values ('c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111',
        'A client', 'planner-a.test', 'gb')
on conflict (user_id, domain) do nothing;
insert into public.gap_projects (id, user_id, name, domain, country)
values ('d4444444-4444-4444-4444-444444444444', 'b2222222-2222-2222-2222-222222222222',
        'B client', 'planner-b.test', 'gb')
on conflict (user_id, domain) do nothing;

-- ------------------------------------------------- the project, extended

select 'a project starts with no budget rather than a budget of nothing: ' ||
  (select monthly_budget_minor is null and monthly_link_target is null
   from public.gap_projects where id = 'c3333333-3333-3333-3333-333333333333');

select 'and with a currency to total its summaries in: ' ||
  (select currency = 'GBP' from public.gap_projects where id = 'c3333333-3333-3333-3333-333333333333');

-- ----------------------------------------------------------- the statuses

select 'seeding gives a customer the eleven defaults: ' ||
  (public.planner_seed_statuses('a1111111-1111-1111-1111-111111111111') = 11);

/*
  And does nothing the second time. A customer who has renamed, recoloured
  and deleted their way to four statuses must not have eleven handed back
  the next time something calls this.
*/
select 'and seeding again changes nothing: ' ||
  (public.planner_seed_statuses('a1111111-1111-1111-1111-111111111111') = 0);

select public.planner_seed_statuses('b2222222-2222-2222-2222-222222222222');

select 'every default status reports as one of the seven categories: ' ||
  (select count(*) = 0 from public.planner_statuses
   where category not in ('planned','in_progress','scheduled','waiting','live','lost','cancelled'));

-- A colour is a colour, not a stylesheet.
do $$
declare v_refused boolean := false;
begin
  insert into public.planner_statuses (user_id, name, colour, category)
  values ('a1111111-1111-1111-1111-111111111111', 'Injected', 'red; content: url(x)', 'planned');
exception when check_violation then v_refused := true;
end;
$$;
select 'a colour that is not a hex colour is refused: ' ||
  (select count(*) = 0 from public.planner_statuses where name = 'Injected');

-- -------------------------------------------------------------- a link

insert into public.planner_links
  (id, user_id, project_id, plan_month, domain, domain_key, status_id, anchor_text)
select 'e5555555-5555-5555-5555-555555555555',
       'a1111111-1111-1111-1111-111111111111',
       'c3333333-3333-3333-3333-333333333333',
       date '2026-10-01', 'Forbes.com/some/path', 'forbes.com',
       s.id, 'best betting sites'
from public.planner_statuses s
where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Planned'
on conflict (id) do nothing;

/*
  The assertion the whole "blank is not zero" rule rests on. A planner that
  defaults these to 0 reports a portfolio average domain rating that falls
  every time somebody adds a row they have not researched yet.
*/
select 'a new link knows none of its metrics, rather than knowing they are zero: ' ||
  (select domain_rating is null and organic_traffic is null
      and organic_keywords is null and referring_domains is null
      and price_minor is null
   from public.planner_links where id = 'e5555555-5555-5555-5555-555555555555');

select 'what was typed and what is matched on are kept apart: ' ||
  (select domain = 'Forbes.com/some/path' and domain_key = 'forbes.com'
   from public.planner_links where id = 'e5555555-5555-5555-5555-555555555555');

-- A month is a month, not a day in one.
do $$
declare v_refused boolean := false;
begin
  insert into public.planner_links (user_id, project_id, plan_month, domain, domain_key, status_id)
  select 'a1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333',
         date '2026-10-15', 'midmonth.test', 'midmonth.test', s.id
  from public.planner_statuses s
  where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Planned';
exception when check_violation then v_refused := true;
end;
$$;
select 'a plan month pinned to the 15th is refused: ' ||
  (select count(*) = 0 from public.planner_links where domain_key = 'midmonth.test');

-- Partly paid, with no figure, is not a state anybody can report on.
do $$
declare v_refused boolean := false;
begin
  update public.planner_links set payment_status = 'partially_paid', paid_minor = null
  where id = 'e5555555-5555-5555-5555-555555555555';
exception when check_violation then v_refused := true;
end;
$$;
select 'partly paid without an amount is refused: ' ||
  (select payment_status = 'unpaid' from public.planner_links
   where id = 'e5555555-5555-5555-5555-555555555555');

-- ------------------------------------------ a link belongs to one person

/*
  Both halves of this are invisible to the row's own policy, because the
  row's `user_id` would be the attacker's own. What leaks is the other way
  round: the owner of that project opens their plan and finds a row they
  did not write, attached by a foreign key they cannot see.
*/
do $$
declare v_refused boolean := false;
begin
  insert into public.planner_links (user_id, project_id, plan_month, domain, domain_key, status_id)
  select 'a1111111-1111-1111-1111-111111111111',
         'd4444444-4444-4444-4444-444444444444',  -- B's project
         date '2026-10-01', 'cross.test', 'cross.test', s.id
  from public.planner_statuses s
  where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Planned';
exception when others then v_refused := true;
end;
$$;
select 'a link cannot be filed under somebody else''s project: ' ||
  (select count(*) = 0 from public.planner_links where domain_key = 'cross.test');

do $$
declare v_refused boolean := false;
begin
  insert into public.planner_links (user_id, project_id, plan_month, domain, domain_key, status_id)
  select 'a1111111-1111-1111-1111-111111111111', 'c3333333-3333-3333-3333-333333333333',
         date '2026-10-01', 'borrowed.test', 'borrowed.test', s.id
  from public.planner_statuses s
  where s.user_id = 'b2222222-2222-2222-2222-222222222222' and s.name = 'Planned';  -- B's status
exception when others then v_refused := true;
end;
$$;
select 'nor wear somebody else''s status: ' ||
  (select count(*) = 0 from public.planner_links where domain_key = 'borrowed.test');

-- ------------------------------- a status in use is not deleted by accident

do $$
declare v_refused boolean := false;
begin
  delete from public.planner_statuses
  where user_id = 'a1111111-1111-1111-1111-111111111111' and name = 'Planned';
exception when foreign_key_violation then v_refused := true;
end;
$$;
select 'a status with links on it cannot be deleted: ' ||
  (select count(*) = 1 from public.planner_statuses
   where user_id = 'a1111111-1111-1111-1111-111111111111' and name = 'Planned');

with archived as (
  update public.planner_statuses set archived_at = timezone('utc', now())
  where user_id = 'a1111111-1111-1111-1111-111111111111' and name = 'Outreach Sent'
  returning archived_at
)
select 'but it can be archived, which is what the screen offers instead: ' ||
  (select count(*) = 1 from archived where archived_at is not null);

-- ------------------------------------------------------- who can read it

/*
  Two customers, and the second one is the test. A planner checked only
  against `anon` would pass with a policy reading `true`.
*/
do $$
declare
  v_anon integer;
  v_other integer;
  v_own integer;
begin
  set local role anon;
  select count(*) into v_anon from public.planner_links;
  reset role;

  set local role authenticated;
  set local request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';
  select count(*) into v_other from public.planner_links;
  reset role;
  set local request.jwt.claim.sub = '';

  set local role authenticated;
  set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';
  select count(*) into v_own from public.planner_links;
  reset role;
  set local request.jwt.claim.sub = '';

  /*
    The owner's count is the control, and it is not decoration. The first
    run of this file had a broken fixture, so there were no rows at all -
    and anon-sees-nothing and the-other-agency-sees-nothing both passed
    while proving only that an empty table is hard to read.
  */
  raise notice 'the owner reads their own link: %', v_own = 1;
  raise notice 'anon reads no planner links: %', v_anon = 0;
  raise notice 'another agency reads none of them either: %', v_other = 0;
end;
$$;

/*
  The same for the supplier list, which is the single most sensitive table
  here: an agency's own list of who they buy from.
*/
insert into public.planner_sources (user_id, name)
values ('a1111111-1111-1111-1111-111111111111', 'A Private Supplier Ltd')
on conflict (user_id, name) do nothing;

do $$
declare v_role text; v_seen integer;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    execute format('set local role %I', v_role);
    set local request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';
    select count(*) into v_seen from public.planner_sources;
    reset role;
    set local request.jwt.claim.sub = '';
    raise notice '% cannot read another agency''s suppliers: %', v_role, v_seen = 0;
  end loop;
end;
$$;

-- ------------------------------------------- a row cannot be handed away

/*
  Moving a row to another account, with the trigger given no reason to object.

  Two corrections are baked into this block, and both were found by breaking
  the migration and watching the test pass anyway.

  The first version changed `user_id` alone, which
  `planner_links_same_owner` refuses on its own - so the trigger was doing
  the work and the policy was never exercised. Changing `project_id` to
  match gives the trigger a consistent row to approve.

  The second was a claim, now removed, that this isolates the policy's
  `with check`. It does not, and nothing can: Postgres applies the `using`
  expression as the check when a `for all` policy omits `with check`, so
  deleting that clause changes no behaviour and no test can see it go. It
  is written out in the migration because it is the convention here and
  because a later edit to `using` alone would otherwise silently widen
  writes - not because it is load-bearing today.

  What this does prove is the thing that matters: one customer cannot move
  a row into another account. The weakening that *is* visible - a `using`
  that stops naming the owner - is caught by the visibility block above,
  confirmed by breaking it.
*/
do $$
declare
  v_refused boolean := false;
  v_rows integer;
begin
  select count(*) into v_rows from public.planner_links
   where id = 'e5555555-5555-5555-5555-555555555555';
  raise notice 'there is a row to try this on: %', v_rows = 1;

  set local role authenticated;
  set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';
  begin
    update public.planner_links
       set user_id = 'b2222222-2222-2222-2222-222222222222',
           project_id = 'd4444444-4444-4444-4444-444444444444'
     where id = 'e5555555-5555-5555-5555-555555555555';
  exception when others then v_refused := true;
  end;
  reset role;
  set local request.jwt.claim.sub = '';
  raise notice 'a customer cannot hand their link to another account: %', v_refused;
end;
$$;

select 'and the row still belongs to the one who wrote it: ' ||
  (select user_id = 'a1111111-1111-1111-1111-111111111111' from public.planner_links
   where id = 'e5555555-5555-5555-5555-555555555555');

/*
  And the same on a table with no trigger at all, so one of these rests on
  nothing but the policy. `planner_sources` is the right one to do it on: a
  customer's own supplier list, with no second owner to cross-check against,
  so a refusal here can only have come from row security.
*/
do $$
declare
  v_refused boolean := false;
  v_rows integer;
begin
  select count(*) into v_rows from public.planner_sources
   where user_id = 'a1111111-1111-1111-1111-111111111111';
  raise notice 'there is a supplier to try this on: %', v_rows = 1;

  set local role authenticated;
  set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';
  begin
    update public.planner_sources
       set user_id = 'b2222222-2222-2222-2222-222222222222'
     where user_id = 'a1111111-1111-1111-1111-111111111111';
  exception when others then v_refused := true;
  end;
  reset role;
  set local request.jwt.claim.sub = '';
  raise notice 'nor hand over a supplier, with only row security to stop them: %', v_refused;
end;
$$;

select 'and the supplier is still theirs: ' ||
  (select count(*) = 1 from public.planner_sources
   where user_id = 'a1111111-1111-1111-1111-111111111111');

-- -------------------------------------------- and we cannot read it either

/*
  The deliberate difference from `gap_projects`, asserted rather than
  described. These four tables carry one policy each - the customer's - and
  no admin policy at all, because an ambient grant over an agency's supplier
  prices is a standing invitation to price against them.

  Asserted against the catalogue, because a policy added later by somebody
  reaching for the `gap_projects` pattern is exactly how this would be
  undone, and it would be undone silently.
*/
select 'the planner tables carry one policy each, and it is the customer''s: ' ||
  (select count(*) = 4 from pg_policies
   where schemaname = 'public'
     and tablename in ('planner_links', 'planner_months', 'planner_sources', 'planner_statuses')
     and policyname like 'Customers manage their own%');

select 'and no admin policy was added beside it: ' ||
  (select count(*) = 0 from pg_policies
   where schemaname = 'public'
     and tablename in ('planner_links', 'planner_months', 'planner_sources', 'planner_statuses')
     and policyname not like 'Customers manage their own%');

-- ------------------------------------ one planner row per order item (0082)

/*
  The Press Parrot order import's duplicate rule, asserted against the
  database rather than against the code that calls it.

  The application reads which order items are already in a plan and then
  inserts the rest, and between those two statements a second click is a
  second import. 0082 makes that impossible rather than unlikely, which is
  the arrangement `outbound_emails` has for its approver and
  `sales_suppressions` has for an unsubscribe.
*/
insert into public.websites (id, slug, domain, title, country_code, country_source, status)
values ('f6666666-6666-6666-6666-666666666666', 'planner-order-com', 'planner-order.com',
        'Planner Order', 'GB', 'stated', 'active')
on conflict (id) do nothing;

insert into public.orders (id, reference, user_id, status, total_minor)
values ('07777777-7777-7777-7777-777777777777', 'LM-PLANNER-1',
        'a1111111-1111-1111-1111-111111111111', 'live', 30000)
on conflict (id) do nothing;

insert into public.order_items (id, order_id, website_id, website_domain, website_slug,
                                service_type, price_minor, target_url, anchor_text, status)
values ('18888888-8888-8888-8888-888888888888', '07777777-7777-7777-7777-777777777777',
        'f6666666-6666-6666-6666-666666666666', 'planner-order.com', 'planner-order-com',
        'guest-post', 30000, 'https://planner-a.test/page', 'best guides', 'live')
on conflict (id) do nothing;

/* The positive control. Importing once works, or the refusal below proves
   nothing - a unique index on a column no insert can reach would pass this
   section by refusing everything. */
insert into public.planner_links
  (id, user_id, project_id, plan_month, domain, domain_key, status_id, order_item_id, source)
select '29999999-9999-9999-9999-999999999999',
       'a1111111-1111-1111-1111-111111111111',
       'c3333333-3333-3333-3333-333333333333',
       date '2026-09-01', 'planner-order.com', 'planner-order.com',
       s.id, '18888888-8888-8888-8888-888888888888', 'Press Parrot'
from public.planner_statuses s
where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Live'
on conflict (id) do nothing;

select 'an order imports into a plan once: ' ||
  (select count(*) = 1 from public.planner_links
   where order_item_id = '18888888-8888-8888-8888-888888888888');

do $$
declare v_refused boolean := false;
begin
  insert into public.planner_links
    (user_id, project_id, plan_month, domain, domain_key, status_id, order_item_id, source)
  select 'a1111111-1111-1111-1111-111111111111',
         'c3333333-3333-3333-3333-333333333333',
         date '2026-10-01', 'planner-order.com', 'planner-order.com',
         s.id, '18888888-8888-8888-8888-888888888888', 'Press Parrot'
  from public.planner_statuses s
  where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Live';
exception when unique_violation then v_refused := true;
end;
$$;

select 'and importing it a second time is refused by the database: ' ||
  (select count(*) = 1 from public.planner_links
   where order_item_id = '18888888-8888-8888-8888-888888888888');

/*
  And it keys on the item, not on "imported at all": a second placement off
  the same order goes in.

  Worth asserting because the cheap version of this rule - one planner row
  per order - would have refused it, and an order of five placements is five
  links somebody is planning separately.

  Not asserted: that the index is partial. It is, but nothing here could
  tell, because Postgres treats nulls as distinct in a unique index and a
  non-partial one would admit every typed link just the same. The `where`
  clause is there for the index's size, not for its behaviour, so there is
  nothing to test - the lesson this file already learned about `with check`.
*/
insert into public.order_items (id, order_id, website_id, website_domain, website_slug,
                                service_type, price_minor, target_url, anchor_text, status)
values ('3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '07777777-7777-7777-7777-777777777777',
        'f6666666-6666-6666-6666-666666666666', 'planner-order.com', 'planner-order-com',
        'niche-edit', 12000, 'https://planner-a.test/other', 'read more', 'live')
on conflict (id) do nothing;

insert into public.planner_links
  (user_id, project_id, plan_month, domain, domain_key, status_id, order_item_id, source)
select 'a1111111-1111-1111-1111-111111111111',
       'c3333333-3333-3333-3333-333333333333',
       date '2026-09-01', 'planner-order.com', 'planner-order.com',
       s.id, '3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Press Parrot'
from public.planner_statuses s
where s.user_id = 'a1111111-1111-1111-1111-111111111111' and s.name = 'Live';

select 'while a second placement off the same order imports fine: ' ||
  (select count(*) = 2 from public.planner_links
   where order_item_id in ('18888888-8888-8888-8888-888888888888',
                           '3aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'));

/*
  The other half of the brief's rule: the planner row references the order
  item and changes nothing about it. Asserted because `on delete set null`
  and a reference are easy to confuse with ownership - a planner status is
  the customer's working note, and the order's own status is what we are
  contractually doing.
*/
select 'and the order item it came from is untouched by the plan: ' ||
  (select status = 'live' and price_minor = 30000 from public.order_items
   where id = '18888888-8888-8888-8888-888888888888');
