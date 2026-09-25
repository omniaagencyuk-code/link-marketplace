-- ---------------------------------------------------------------------------
-- Who to email about a placement
--
-- An order tells us a customer bought a guest post on a domain. Fulfilling it
-- means somebody at Press Parrot emails the publisher, and until now that
-- address lived in whoever's inbox negotiated it. This puts it on the record,
-- beside the buy price it was agreed with.
--
-- A separate table rather than columns on `websites`, for the same reason
-- `service_costs` is separate and stated in 0008: `websites` is readable by
-- every signed-in customer, and row level security cannot hide one column.
-- A publisher's email address is not a marketplace fact - it is ours, it was
-- given in confidence, and a customer who could read it could go around the
-- marketplace entirely.
-- ---------------------------------------------------------------------------

create table if not exists public.website_contacts (
  website_id uuid primary key references public.websites (id) on delete cascade,
  -- The address placements are arranged through. Not validated beyond a shape
  -- check: publishers hand over all sorts, and refusing a working address for
  -- failing a regex would be worse than storing an odd one.
  email text check (email is null or email like '%@%.%'),
  -- Who answers, where it is a person rather than a role address.
  contact_name text,
  -- Anything an account manager needs to know before writing: preferred
  -- format, invoicing quirks, who to chase. Internal, never customer-facing.
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by text
);

create or replace trigger website_contacts_set_updated_at
  before update on public.website_contacts
  for each row execute function public.set_updated_at();

comment on table public.website_contacts is
  'Publisher contact details. Internal only - no customer-facing policy exists, deliberately.';

alter table public.website_contacts enable row level security;

-- One policy, and it is for admins. As with `service_costs`, there is
-- deliberately no select policy for anon or authenticated: with RLS on and no
-- matching policy the table is invisible, and an embedded join from
-- `websites` comes back empty rather than returning an address. A customer
-- cannot read it through the REST API, through a crafted embed, or through a
-- query the application forgot to filter.
do $$
begin
  create policy "Admins manage website contacts"
    on public.website_contacts for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;
