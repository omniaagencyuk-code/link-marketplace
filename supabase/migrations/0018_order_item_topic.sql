-- ---------------------------------------------------------------------------
-- What the placement is about, and what it cost because of that
--
-- Publishers charge more for regulated topics, and since 0015 those rates are
-- stored per website. Nothing was charging them: a gambling guest post on a
-- site with a 900 pound gambling rate was billed at the 300 pound list price,
-- because an order item recorded the placement and never the subject.
--
-- `topic` is the buyer's declaration, made at checkout. `list_price_minor` is
-- what the placement would have cost without it. Keeping both means the order
-- explains its own price a year later, when the rate card has moved on.
--
-- The two domain columns are a separate fix that belongs here because the
-- same insert writes them. `order_items` never stored the domain, and the
-- application has been reading `website_domain` off the row since orders
-- existed - blank against a real database. It cannot be an embed from
-- `websites`: that table is readable only where `status = 'active'`, so a
-- customer's own order history would lose its domains the day a publisher was
-- archived. The domain is copied in at purchase, which is what an order is -
-- a record of what was bought, at the terms of the day.
-- ---------------------------------------------------------------------------

alter table public.order_items add column if not exists website_domain text;

alter table public.order_items add column if not exists website_slug text;

alter table public.order_items add column if not exists topic text;

alter table public.order_items add column if not exists list_price_minor integer;

comment on column public.order_items.topic is
  'Accepted-niche slug the buyer declared for this placement. Null on orders placed before topics existed.';

comment on column public.order_items.list_price_minor is
  'The standard rate at the time of purchase. Equal to price_minor unless a niche premium applied.';

update public.order_items as item
   set website_domain = site.domain,
       website_slug = site.slug
  from public.websites as site
 where site.id = item.website_id
   and (item.website_domain is null or item.website_slug is null);

update public.order_items
   set list_price_minor = price_minor
 where list_price_minor is null;

alter table public.order_items alter column website_domain set not null;

alter table public.order_items alter column website_slug set not null;

create index if not exists order_items_topic_idx on public.order_items (topic);
