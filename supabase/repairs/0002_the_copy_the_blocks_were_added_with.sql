-- The twelve-month traffic claim, in the blocks that were added before it was
-- corrected.
--
-- What was observed: the homepage's Marketplace Showcase and The Metrics,
-- Drawn blocks render on the live site reading "Organic traffic over twelve
-- months, not a single flattering month", "twelve months of organic traffic"
-- and "with the date they were measured" - the wording #68 removed.
--
-- The code was right and the page was wrong, because a component's `defaults`
-- are copied into `page_sections.values` when an editor adds the block and
-- stored there. Correcting the defaults afterwards does not reach a row that
-- already exists. These blocks were added from a build that still carried the
-- old copy.
--
-- None of it was true: `traffic_trend` was empty on every listing, and no
-- measurement date reaches a customer. 0087 has since started recording the
-- readings, but a listing holds none yet, so the claim has to go whatever
-- happens next.
--
-- ## Re-runnable, and it will not touch an edit
--
-- Every statement matches on the exact string that shipped as the default. A
-- second paste finds nothing to change, and a block somebody has since
-- reworded is left alone rather than reverted - which is the repair rules'
-- "never guess a value" applied to copy: an editor's sentence is not ours to
-- overwrite because it happens to sit in the field we got wrong.
--
-- `section_drafts` is updated on the same terms. A draft still holding the old
-- wording would put it back on the page the next time somebody published.

-- ------------------------------------------------- the showcase's own body

update public.page_sections
set values = jsonb_set(
  values,
  '{body}',
  to_jsonb('Every listing arrives with the figures you would otherwise go and look up one site at a time: domain rating, organic search traffic, referring domains, the countries its readers are in and what it already ranks for. Filter on them, compare what is left, and shortlist the publishers worth buying from.'::text)
)
where component = 'marketplace-showcase'
  and values->>'body' = 'Every listing arrives with the figures you would otherwise go and look up one site at a time: domain rating, twelve months of organic traffic, referring domains, the countries its readers are in and what it already ranks for. Filter on them, compare what is left, and shortlist the publishers worth buying from.';

update public.section_drafts
set values = jsonb_set(
  values,
  '{body}',
  to_jsonb('Every listing arrives with the figures you would otherwise go and look up one site at a time: domain rating, organic search traffic, referring domains, the countries its readers are in and what it already ranks for. Filter on them, compare what is left, and shortlist the publishers worth buying from.'::text)
)
where values->>'body' = 'Every listing arrives with the figures you would otherwise go and look up one site at a time: domain rating, twelve months of organic traffic, referring domains, the countries its readers are in and what it already ranks for. Filter on them, compare what is left, and shortlist the publishers worth buying from.';

-- --------------------------------------- the fifth caption beside the panel
--
-- The captions are a jsonb array, so the array is rebuilt with the one
-- matching element replaced. `with ordinality` and the `order by` are what
-- keep the six in the order the animation highlights them in: jsonb_agg has
-- no inherent order, and a silently reordered list would light the wrong
-- caption on every beat.

update public.page_sections
set values = jsonb_set(
  values,
  '{steps}',
  (
    select jsonb_agg(
      case
        when step->>'body' = 'Twelve months of organic traffic, where the readers actually are, and the terms the site already ranks for.'
        then jsonb_set(step, '{body}', to_jsonb('The organic search traffic it really gets, where its readers actually are, and the terms it already ranks for.'::text))
        else step
      end
      order by ord
    )
    from jsonb_array_elements(values->'steps') with ordinality as entry(step, ord)
  )
)
where component = 'marketplace-showcase'
  and jsonb_typeof(values->'steps') = 'array'
  and exists (
    select 1 from jsonb_array_elements(values->'steps') as s
    where s->>'body' = 'Twelve months of organic traffic, where the readers actually are, and the terms the site already ranks for.'
  );

update public.section_drafts
set values = jsonb_set(
  values,
  '{steps}',
  (
    select jsonb_agg(
      case
        when step->>'body' = 'Twelve months of organic traffic, where the readers actually are, and the terms the site already ranks for.'
        then jsonb_set(step, '{body}', to_jsonb('The organic search traffic it really gets, where its readers actually are, and the terms it already ranks for.'::text))
        else step
      end
      order by ord
    )
    from jsonb_array_elements(values->'steps') with ordinality as entry(step, ord)
  )
)
where jsonb_typeof(values->'steps') = 'array'
  and exists (
    select 1 from jsonb_array_elements(values->'steps') as s
    where s->>'body' = 'Twelve months of organic traffic, where the readers actually are, and the terms the site already ranks for.'
  );

-- ------------------------------------------- the metrics section's own body

update public.page_sections
set values = jsonb_set(
  values,
  '{body}',
  to_jsonb('A publisher telling you their site is authoritative is not evidence. These four are: what the site ranks for, how much search traffic it genuinely gets, how many other sites link to it, and which countries its readers are in. Every listing in the marketplace carries all four, measured by Ahrefs rather than quoted to us.'::text)
)
where component = 'seo-metrics'
  and values->>'body' = 'A publisher telling you their site is authoritative is not evidence. These four are: what the site ranks for, how much search traffic it genuinely gets, how many other sites link to it, and which countries its readers are in. Every listing in the marketplace carries all four, with the date they were measured.';

update public.section_drafts
set values = jsonb_set(
  values,
  '{body}',
  to_jsonb('A publisher telling you their site is authoritative is not evidence. These four are: what the site ranks for, how much search traffic it genuinely gets, how many other sites link to it, and which countries its readers are in. Every listing in the marketplace carries all four, measured by Ahrefs rather than quoted to us.'::text)
)
where values->>'body' = 'A publisher telling you their site is authoritative is not evidence. These four are: what the site ranks for, how much search traffic it genuinely gets, how many other sites link to it, and which countries its readers are in. Every listing in the marketplace carries all four, with the date they were measured.';

-- ------------------------------------------------------- and the first bullet

update public.page_sections
set values = jsonb_set(
  values,
  '{items}',
  (
    select jsonb_agg(
      case
        when item->>'label' = 'Organic traffic over twelve months, not a single flattering month'
        then jsonb_set(item, '{label}', to_jsonb('Organic search traffic, measured rather than quoted by the publisher'::text))
        else item
      end
      order by ord
    )
    from jsonb_array_elements(values->'items') with ordinality as entry(item, ord)
  )
)
where component = 'seo-metrics'
  and jsonb_typeof(values->'items') = 'array'
  and exists (
    select 1 from jsonb_array_elements(values->'items') as s
    where s->>'label' = 'Organic traffic over twelve months, not a single flattering month'
  );

update public.section_drafts
set values = jsonb_set(
  values,
  '{items}',
  (
    select jsonb_agg(
      case
        when item->>'label' = 'Organic traffic over twelve months, not a single flattering month'
        then jsonb_set(item, '{label}', to_jsonb('Organic search traffic, measured rather than quoted by the publisher'::text))
        else item
      end
      order by ord
    )
    from jsonb_array_elements(values->'items') with ordinality as entry(item, ord)
  )
)
where jsonb_typeof(values->'items') = 'array'
  and exists (
    select 1 from jsonb_array_elements(values->'items') as s
    where s->>'label' = 'Organic traffic over twelve months, not a single flattering month'
  );
