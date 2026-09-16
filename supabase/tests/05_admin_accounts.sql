\pset tuples_only on
\pset format unaligned

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'newadmin@test'),
  ('44444444-4444-4444-4444-444444444444', 'someone@test');

-- Bootstrap: the project owner promotes the first admin by hand.
update public.profiles set role = 'admin' where email = 'admin@test';
select 'bootstrap admin exists: ' || count(*) from public.profiles where role = 'admin';

-- A customer must not be able to promote themselves.
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select 'customer self-promotion: ' || public.grant_admin('someone@test');
reset role;
reset request.jwt.claim.sub;

-- An admin can grant.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'admin grants newadmin: ' || public.grant_admin('newadmin@test');
select 'granting an unregistered address: ' || public.grant_admin('nobody@test');
select 'admins now: ' || count(*) from public.profiles where role = 'admin';

-- The new admin genuinely has admin powers in the database.
reset role; reset request.jwt.claim.sub;
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select 'new admin is_admin(): ' || public.is_admin();
select 'new admin reads service_costs: ' || count(*) from public.service_costs;
reset role; reset request.jwt.claim.sub;

-- Revoking works, but never down to zero admins.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'revoke newadmin: ' || public.revoke_admin('newadmin@test');
select 'admins left: ' || count(*) from public.profiles where role = 'admin';
reset role; reset request.jwt.claim.sub;

-- The last admin cannot remove themselves and strand the account.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'removing the last admin: ' || public.revoke_admin('admin@test');
reset role; reset request.jwt.claim.sub;
