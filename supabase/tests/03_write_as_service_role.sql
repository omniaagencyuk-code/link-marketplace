\pset tuples_only on
\pset format unaligned
set role service_role;
insert into public.websites (slug, domain, title, country_code, status)
values ('service-role-ok', 'service-role-ok.com', 'x', 'GB', 'draft');
select 'service_role insert: OK';
select 'service_role sees service_costs: ' || count(*) from public.service_costs;
