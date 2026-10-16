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
select 'granting an address nobody has registered does nothing: '
       || (not public.grant_admin('nobody@test'));
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

-- ------------------------------------------------- there are no plans (0089)
--
-- `profiles.plan` was there from 0001 and nobody could ever be on a plan. It
-- was not harmless: `tierFor(user.plan)` charged an account marked 'agency'
-- the stored agency rate, while the billing page told everybody they had a
-- 7% discount. Both are gone; a promo code is the only discount.
--
-- The second assertion is the one worth having. `admin_user_rows` selected
-- `p.plan`, and a `language sql` body is stored as text: dropping the column
-- succeeds, the function survives, and it fails on its next call. Measured
-- rather than assumed - dropping the column out from under a function that
-- named it did exactly that. So 0089 replaces the function before dropping
-- the column, and this calls it afterwards.

select 'a profile has no plan, because there are no plans: ' ||
  (select count(*) = 0 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'plan');

select 'and the admin user list still answers after the column went: ' ||
  (select count(*) >= 0 from public.admin_user_rows());

select 'without a plan among its columns: ' ||
  (select count(*) = 0 from information_schema.columns
    where table_name = 'admin_user_rows' and column_name = 'plan');
