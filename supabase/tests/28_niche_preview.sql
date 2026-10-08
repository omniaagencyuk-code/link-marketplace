\pset tuples_only on
\pset format unaligned

-- ---------------------------------------------------------------------------
-- A niche page's preview.
--
-- This replaces JavaScript that read every active listing and sampled it, so
-- what matters is that it samples the same way. The spread is not incidental:
-- the code it replaces walks the ordered listings in strides "so the preview
-- represents the marketplace instead of advertising its top end", and a
-- version that quietly returned the strongest six would look fine and would
-- change what the marketing pages claim.
-- ---------------------------------------------------------------------------

insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, domain_rating, primary_category_id)
select
  'np-' || lpad(n::text, 3, '0'),
  'np-' || lpad(n::text, 3, '0') || '.test',
  'NP ' || n,
  'active',
  case when n % 3 = 0 then 'US' else 'GB' end,
  'stated',
  'en',
  -- Descending with n, so the order is known and the sample is predictable.
  100 - n,
  (select id from public.categories where slug = 'crypto')
from generate_series(1, 20) as n
on conflict (slug) do nothing;

-- A paused one, and one in another niche: neither may appear.
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, domain_rating, primary_category_id)
select v.slug, v.domain, v.title, v.status::public.website_status, 'GB', 'stated', 'en', 99,
       (select id from public.categories where slug = v.cat)
from (values
  ('np-paused', 'np-paused.test', 'Paused', 'paused', 'crypto'),
  ('np-other',  'np-other.test',  'Other',  'active', 'travel')
) as v(slug, domain, title, status, cat)
on conflict (slug) do nothing;

-- A listing whose crypto membership is secondary, which `inNiche` counts.
insert into public.websites (slug, domain, title, status, country_code, country_source, language_code, domain_rating, primary_category_id)
select 'np-secondary', 'np-secondary.test', 'Secondary', 'active', 'GB', 'stated', 'en', 1,
       (select id from public.categories where slug = 'travel')
on conflict (slug) do nothing;

insert into public.website_categories (website_id, category_id, is_primary)
select w.id, c.id, false
from public.websites w, public.categories c
where w.slug = 'np-secondary' and c.slug = 'crypto'
on conflict do nothing;

-- -------------------------------------------------------------- the counts

select 'the count is the niche, not the marketplace: ' ||
  (select coalesce(min(total), -1) = 21 from public.marketplace_niche_preview('crypto', 6));

select 'a paused listing is not counted: ' ||
  (select coalesce(min(total), -1) <> 22 from public.marketplace_niche_preview('crypto', 6));

select 'a listing in another niche is not counted: ' ||
  (select count(*) = 0 from public.marketplace_niche_preview('crypto', 24) p
   join public.websites w on w.id = p.id where w.slug = 'np-other');

/*
  Secondary membership counts, because `inNiche` counts it.

  A publisher who also covers crypto belongs on the crypto page; counting
  only the primary category would quietly shrink every niche page's number.
*/
select 'a secondary niche counts as being in it: ' ||
  (select count(*) = 1 from public.marketplace_niche_preview('crypto', 24) p
   join public.websites w on w.id = p.id where w.slug = 'np-secondary');

select 'the countries are counted within the niche: ' ||
  (select coalesce(min(countries), -1) = 2 from public.marketplace_niche_preview('crypto', 6));

-- ------------------------------------------------------------- the sample

select 'the sample is the size asked for: ' ||
  (select count(*) = 6 from public.marketplace_niche_preview('crypto', 6));

/*
  Spread, not the top six.

  21 listings and a limit of 6 gives a stride of 3, so the sample is
  positions 0, 3, 6, 9, 12, 15 of the order - which is np-001, np-004,
  np-007, np-010, np-013, np-016 by descending domain rating.

  Taking the strongest six would give np-001 to np-006, so this assertion is
  the difference between the two.
*/
select 'it walks the order in strides rather than taking the strongest: ' ||
  coalesce((select string_agg(w.slug, ',' order by p.ord)
            from (select id, row_number() over () as ord
                  from public.marketplace_niche_preview('crypto', 6)) p
            join public.websites w on w.id = p.id)
           = 'np-001,np-004,np-007,np-010,np-013,np-016', false)::text ||
  ' (got ' || coalesce((select string_agg(w.slug, ',' order by p.ord)
                        from (select id, row_number() over () as ord
                              from public.marketplace_niche_preview('crypto', 6)) p
                        join public.websites w on w.id = p.id), 'nothing') || ')';

select 'a niche nobody is in is empty rather than an error: ' ||
  (select count(*) = 0 from public.marketplace_niche_preview('no-such-niche', 6));

-- ------------------------------------------------- who may call it at all

/*
  Anyone, unlike the admin functions.

  These pages are public: a signed-out visitor on /cbd-backlinks renders
  this. `security invoker` is what keeps that honest - the websites policy
  decides what it returns, exactly as it does for every other public read.
*/
do $$
declare
  r text;
  v_allowed boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    v_allowed := true;
    begin
      execute format('set local role %I', r);
      perform * from public.marketplace_niche_preview('crypto', 6);
    exception when insufficient_privilege then
      v_allowed := false;
    end;
    reset role;
    raise notice '% may read a public niche preview: %', r, v_allowed;
  end loop;
end;
$$;
