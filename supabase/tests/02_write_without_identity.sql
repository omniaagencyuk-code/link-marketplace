\pset tuples_only on
\pset format unaligned
-- The admin area today: authenticated role, no Supabase identity at all.
set role authenticated;
select 'shared-password admin is_admin(): ' || public.is_admin();
insert into public.websites (slug, domain, title, country_code, status)
values ('should-fail', 'should-fail.com', 'x', 'GB', 'draft');
