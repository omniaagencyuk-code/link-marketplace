-- ---------------------------------------------------------------------------
-- 0038  A page created in the admin can choose its design
--
-- Every custom page has rendered through `ServicePage` since custom pages
-- existed, because that was the only template there was. So a sports or
-- finance landing page - the same shape as /gambling-link-building, which is
-- the design that works for a niche - needed a developer: a route, a schema,
-- a registry entry, a deploy.
--
-- That is the thing the brief is actually asking to fix. One column.
--
--   'service'  the five service pages' shape: hero, value points, marketplace
--              preview, body, FAQs, related, CTA.
--
--   'niche'    the gambling page's shape: mascot and banner, a live count of
--              publishers in this niche, a row of filter shortcuts into the
--              marketplace, a content upsell.
--
-- Defaulted to 'service', so every page that exists keeps rendering exactly
-- what it renders now. The constraint is a backstop rather than the rule: the
-- application checks the value against the templates it can actually draw,
-- and a row naming one it cannot falls back rather than failing.
--
-- Re-runnable, like everything from 0017 on.
-- ---------------------------------------------------------------------------

alter table public.custom_pages
  add column if not exists template text not null default 'service';

alter table public.custom_pages drop constraint if exists custom_pages_template_known;

alter table public.custom_pages
  add constraint custom_pages_template_known check (template in ('service', 'niche'));

comment on column public.custom_pages.template is
  'Which frontend template draws this page: service, or niche. The application owns the list; this is the backstop.';
