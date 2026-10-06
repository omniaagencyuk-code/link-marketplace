\pset tuples_only on
\pset format unaligned

-- Ships off, in dry run, and refusing to spend a Hunter credit.
select 'sales ships off: ' || (not enabled and dry_run) from public.sales_settings;
select 'hunter budget starts at zero: ' || (hunter_monthly_credit_budget = 0) from public.sales_settings;

insert into public.prospects (company_name, domain, segment, source)
values ('Northfield SEO', 'northfieldseo.com', 'seo_agency', 'manual');

-- The public token is random, not the row's identity.
select 'public token is 32 hex characters: ' ||
  (public_token ~ '^[0-9a-f]{32}$') from public.prospects where domain = 'northfieldseo.com';
select 'public token is not the id: ' ||
  (public_token <> replace(id::text, '-', '')) from public.prospects where domain = 'northfieldseo.com';

insert into public.prospect_contacts (prospect_id, email, full_name, role, source, selected)
select id, 'maria@northfieldseo.com', 'Maria Ellis', 'Head of SEO', 'hunter', true
from public.prospects where domain = 'northfieldseo.com';

-- One recipient per prospect. Two is how a company hears from us twice.
do $$
begin
  insert into public.prospect_contacts (prospect_id, email, source, selected)
  select id, 'sam@northfieldseo.com', 'hunter', true
  from public.prospects where domain = 'northfieldseo.com';
  raise notice 'a second selected contact was allowed: true';
exception
  when unique_violation then raise notice 'a second selected contact is refused: true';
end;
$$;

-- ------------------------------------------------- nothing sends unapproved --
do $$
begin
  insert into public.outbound_emails (prospect_id, to_address, subject, body_text, status)
  select id, 'maria@northfieldseo.com', 'Quick question', 'Hello.', 'sent'
  from public.prospects where domain = 'northfieldseo.com';
  raise notice 'an unapproved send was allowed: true';
exception
  when others then raise notice 'an unapproved send is refused: true';
end;
$$;

-- A draft is fine, and so is review. It is approval and beyond that is gated.
insert into public.outbound_emails (prospect_id, to_address, subject, body_text, status, step_number)
select id, 'maria@northfieldseo.com', 'Quick question', 'Hello.', 'needs_review', 1
from public.prospects where domain = 'northfieldseo.com';
select 'a draft is allowed: ' || (count(*) = 1) from public.outbound_emails;

do $$
begin
  update public.outbound_emails set status = 'approved' where status = 'needs_review';
  raise notice 'approving without an approver was allowed: true';
exception
  when others then raise notice 'approving without a named approver is refused: true';
end;
$$;

update public.outbound_emails
   set status = 'approved', approved_by = 'ops@pressparrot.com', approved_at = timezone('utc', now())
 where status = 'needs_review';
select 'approved with an approver: ' || (count(*) = 1) from public.outbound_emails where status = 'approved';

-- --------------------------------------------------- an unsubscribe is final --
insert into public.sales_suppressions (email, reason) values ('maria@northfieldseo.com', 'unsubscribed');
select 'the address is suppressed: ' || public.sales_is_suppressed('MARIA@NorthfieldSEO.com');

do $$
begin
  update public.outbound_emails
     set status = 'sent', sent_at = timezone('utc', now())
   where status = 'approved';
  raise notice 'a send to a suppressed address was allowed: true';
exception
  when others then raise notice 'a send to a suppressed address is refused: true';
end;
$$;

-- Stopping is never the thing to refuse.
update public.outbound_emails set status = 'cancelled' where status = 'approved';
select 'cancelling a suppressed email is allowed: ' ||
  (count(*) = 1) from public.outbound_emails where status = 'cancelled';

-- Suppressing a whole company covers everyone at it.
delete from public.sales_suppressions;
insert into public.sales_suppressions (domain, reason) values ('northfieldseo.com', 'do_not_contact');
select 'a company suppression covers a new address: ' ||
  public.sales_is_suppressed('someone.else@northfieldseo.com');
select 'and does not cover another company: ' ||
  (not public.sales_is_suppressed('maria@othercompany.com'));
delete from public.sales_suppressions;

-- ------------------------------------------------------- the sending queue --
insert into public.prospects (company_name, domain, segment, source)
select 'Co ' || i, 'co' || i || '.com', 'ecommerce', 'csv'
from generate_series(1, 5) i;

insert into public.outbound_emails (prospect_id, to_address, subject, body_text, status, approved_by, approved_at)
select p.id, 'buyer@' || p.domain, 'Hello', 'Body.', 'approved', 'ops@pressparrot.com', timezone('utc', now())
from public.prospects p where p.domain like 'co%.com';

select 'five approved and due: ' || (count(*) = 5) from public.sales_sendable(50);
select 'the limit is respected: ' || (count(*) = 2) from public.sales_sendable(2);

-- Two people at the same company: only one goes out.
insert into public.prospects (company_name, domain, segment, source)
values ('Twinned A', 'twinned-a.com', 'saas', 'manual'), ('Twinned B', 'twinned-b.com', 'saas', 'manual');
insert into public.outbound_emails (prospect_id, to_address, subject, body_text, status, approved_by, approved_at)
select id, 'first@sameco.com', 'Hello', 'Body.', 'approved', 'ops@pressparrot.com', timezone('utc', now())
from public.prospects where domain = 'twinned-a.com';
insert into public.outbound_emails (prospect_id, to_address, subject, body_text, status, approved_by, approved_at)
select id, 'second@sameco.com', 'Hello', 'Body.', 'approved', 'ops@pressparrot.com', timezone('utc', now())
from public.prospects where domain = 'twinned-b.com';
select 'one per company, not two: ' ||
  (count(*) = 1) from public.sales_sendable(50) where to_address like '%@sameco.com';

-- A scheduled follow-up waits for its date.
update public.outbound_emails
   set status = 'scheduled', scheduled_at = timezone('utc', now()) + interval '2 days'
 where to_address = 'buyer@co1.com';
select 'a future follow-up is not sendable yet: ' ||
  (count(*) = 0) from public.sales_sendable(50) where to_address = 'buyer@co1.com';

-- The daily cap is a cap on the queue, not a hope about it.
update public.sales_settings set daily_send_cap = 2;
select 'the daily cap bounds the queue: ' || (count(*) = 2) from public.sales_sendable(50);
update public.sales_settings set daily_send_cap = 0;
select 'a cap of zero sends nothing: ' || (count(*) = 0) from public.sales_sendable(50);
update public.sales_settings set daily_send_cap = 40;

-- And what has already gone today counts against it.
update public.outbound_emails
   set status = 'sent', sent_at = timezone('utc', now())
 where to_address in ('buyer@co2.com', 'buyer@co3.com');
select 'two sent today: ' || (public.sales_sent_today() = 2);
update public.sales_settings set daily_send_cap = 3;
select 'the cap counts what already went: ' || (count(*) = 1) from public.sales_sendable(50);
update public.sales_settings set daily_send_cap = 40;

-- --------------------------------------------------------- the credit guard --
select 'no credits spent yet: ' || (public.hunter_credits_this_cycle() = 0);
insert into public.hunter_lookups (endpoint, query, credits_charged, results_count)
values ('domain-search', 'northfieldseo.com', 1, 7);
insert into public.hunter_lookups (endpoint, query, credits_charged, created_at)
values ('domain-search', 'oldcycle.com', 500, timezone('utc', now()) - interval '70 days');
select 'credits come from the ledger: ' || (public.hunter_credits_this_cycle() = 1);

-- A failed lookup that charged nothing must not look like spend.
insert into public.hunter_lookups (endpoint, query, credits_charged, http_status, error)
values ('email-finder', 'nowhere.com', 0, 404, 'No results');
select 'a free failure costs nothing: ' || (public.hunter_credits_this_cycle() = 1);

-- ------------------------------------------------------------ model spend --
select 'no model spend yet: ' || (public.sales_ai_spend_this_month() = 0);
insert into public.prospect_qualifications
  (prospect_id, verdict, confidence, model, prompt_version, input_tokens, output_tokens, cost_usd)
select id, 'likely_buyer', 80, 'claude-opus-5', 'sales-v1', 4000, 600, 0.0350
from public.prospects where domain = 'northfieldseo.com';
select 'model spend is summed from what was reported: ' ||
  (public.sales_ai_spend_this_month() = 0.0350);

-- ----------------------------------------------------------- claiming a run --
select 'first claim succeeds: ' || (public.sales_claim_run('research', false, 'ops') is not null);
select 'a second claim of the same kind is refused: ' ||
  (public.sales_claim_run('research', false, 'ops') is null);
select 'a different kind is unaffected: ' ||
  (public.sales_claim_run('qualify', false, 'ops') is not null);
update public.sales_runs set leased_until = timezone('utc', now()) - interval '2 hours' where kind = 'research';
select 'an abandoned lease is reclaimed: ' ||
  (public.sales_claim_run('research', false, 'ops') is not null);

-- ------------------------------------------------------- nobody else looks --
-- Every table here holds either our cost of sale or a named person's work
-- address. There is no customer-facing policy on any of them, by design.
set role anon;
select 'anon reads prospects: ' || count(*) from public.prospects;
select 'anon reads contacts: ' || count(*) from public.prospect_contacts;
select 'anon reads outbound: ' || count(*) from public.outbound_emails;
select 'anon reads the hunter ledger: ' || count(*) from public.hunter_lookups;
reset role;

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'customer reads prospects: ' || count(*) from public.prospects;
select 'customer reads contacts: ' || count(*) from public.prospect_contacts;
select 'customer reads suppressions: ' || count(*) from public.sales_suppressions;
select 'customer reads sales settings: ' || count(*) from public.sales_settings;

-- Refused BY ROW SECURITY, not by a missing table grant. The two arrive as
-- the same SQLSTATE, and a test that accepts either passes just as happily on
-- a table nobody ever wrote a policy for.
do $$
declare v_message text;
begin
  insert into public.prospects (company_name, domain) values ('Sneaky', 'sneaky.com');
  raise notice 'a customer insert was allowed: true';
exception
  when others then
    v_message := sqlerrm;
    raise notice 'a customer insert is refused by row security: %',
      (v_message ilike '%row-level security%');
end;
$$;
select 'and nothing was written: ' ||
  (count(*) = 0) from public.prospects where domain = 'sneaky.com';

do $$
declare v boolean;
begin
  select public.sales_is_suppressed('maria@northfieldseo.com') into v;
  raise notice 'a customer may ask about suppression: true';
exception
  when insufficient_privilege then raise notice 'a customer asking about suppression is refused: true';
end;
$$;
reset role; reset request.jwt.claim.sub;
