-- ---------------------------------------------------------------------------
-- Reference data: marketplace categories and the settings singleton.
-- Website inventory is imported separately - see supabase/README.md.
-- ---------------------------------------------------------------------------

insert into public.categories (slug, name, description, position, featured) values
  ('igaming', 'iGaming', 'Casino, sportsbook, poker and slots publications.', 1, true),
  ('sports', 'Sports', 'Football, racing, endurance and general sports media.', 2, true),
  ('finance', 'Finance', 'Personal finance, investing, lending and insurance titles.', 3, true),
  ('technology', 'Technology', 'SaaS, developer, hardware and consumer tech publications.', 4, true),
  ('business', 'Business', 'B2B, startups, operations and professional services.', 5, true),
  ('health', 'Health', 'Wellness, nutrition, fitness and clinical content.', 6, true),
  ('travel', 'Travel', 'Destination guides, hospitality and travel planning.', 7, true),
  ('lifestyle', 'Lifestyle', 'Fashion, culture, parenting and everyday living.', 8, true),
  ('crypto', 'Crypto', 'Web3, blockchain, trading and digital asset media.', 9, true),
  ('entertainment', 'Entertainment', 'Film, television, music and streaming coverage.', 10, true),
  ('home-garden', 'Home and Garden', 'Interiors, renovation, gardening and home improvement.', 11, true),
  ('automotive', 'Automotive', 'Cars, EVs, motoring news and aftermarket.', 12, false),
  ('food', 'Food', 'Recipes, restaurants, drinks and food culture.', 13, false)
on conflict (slug) do nothing;

insert into public.settings (order_statuses)
select '[
  {"value":"draft","label":"Draft","description":"Saved but not yet submitted by the customer."},
  {"value":"awaiting-content","label":"Awaiting Content","description":"Brief received, article being written or supplied."},
  {"value":"in-progress","label":"In Progress","description":"Content approved and scheduled with the publisher."},
  {"value":"submitted","label":"Submitted","description":"Sent to the publisher, awaiting publication."},
  {"value":"live","label":"Live","description":"Placement is published and indexed."},
  {"value":"cancelled","label":"Cancelled","description":"Refunded or withdrawn."}
]'::jsonb
where not exists (select 1 from public.settings);
