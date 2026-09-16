-- ---------------------------------------------------------------------------
-- Accepted niches, and what a placement costs us
--
-- Two additions that support the admin rather than the customer:
--
--   1. `accepted_niches` - the topics a publisher will take, as a list rather
--      than the five booleans that came before it. The booleans stay, written
--      in step by the application, because listing pages and filters read them.
--
--   2. `service_costs` - our buy price for a placement, which makes margin
--      visible. This is deliberately a separate table rather than a column on
--      `services`, because `services` is world-readable and row level security
--      cannot hide a single column. A separate table with no public policy is
--      the only version of this that cannot leak.
-- ---------------------------------------------------------------------------

alter table public.websites
  add column if not exists accepted_niches text[] not null default '{}';

comment on column public.websites.accepted_niches is
  'Topics the publisher accepts. The accepts_* booleans are a view of this, kept in step on write.';

-- ------------------------------------------------------------ service costs --
create table public.service_costs (
  service_id uuid primary key references public.services (id) on delete cascade,
  -- What we pay the publisher, in minor units. A row exists only once someone
  -- has recorded a cost; absence means unknown, which is not the same as zero.
  cost_price_minor integer not null check (cost_price_minor >= 0),
  note text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create trigger service_costs_set_updated_at
  before update on public.service_costs
  for each row execute function public.set_updated_at();

alter table public.service_costs enable row level security;

-- One policy, and it is for admins. There is deliberately no select policy for
-- anon or authenticated: with RLS on and no policy that matches, the table is
-- invisible, and an embedded join from `services` comes back empty rather than
-- returning a cost. A customer cannot read our margin through the REST API,
-- through a crafted embed, or through a query the application forgot to filter.
create policy "Admins manage service costs"
  on public.service_costs for all
  using (public.is_admin()) with check (public.is_admin());
