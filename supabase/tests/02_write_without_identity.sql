\pset tuples_only on
\pset format unaligned
-- The admin area today: authenticated role, no Supabase identity at all.
set role authenticated;
-- Phrased so that passing prints true. Every assertion in this suite
-- does, because `verify-rls.sh` fails the run on any printed false and
-- cannot tell a wrong answer from a right one worded backwards.
select 'the shared-password admin carries no Supabase identity, so is_admin() is false: '
       || (not public.is_admin());
insert into public.websites (slug, domain, title, country_code, country_source, status)
values ('should-fail', 'should-fail.com', 'x', 'GB', 'stated', 'draft');
