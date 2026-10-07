-- ---------------------------------------------------------------------------
-- 0062  Senders we will not buy from
--
-- A reseller mails the same list as everybody else and quotes 150 USD for a
-- site four other people sell at 35. Nothing about their drafts is wrong, so
-- no flag catches them, and there is no number to compare against until the
-- rival offers arrive - by which time somebody has already read all four.
--
-- So they are blocked by name: an address, or a whole company domain for a
-- reseller with three staff writing from one office.
--
-- The block is enforced by a trigger on `inbound_emails` rather than by
-- whoever is inserting into it, which is the same argument `sales_suppressions`
-- is built on and the same words: a suppression that depends on every future
-- caller remembering it is not a suppression. There are four places a reply
-- can enter this system - an mbox upload, a Gmail import, a paste, a split
-- part - and a check in three of them is a block that leaks.
--
-- Blocking is free in model tokens, which is the other half of the point. A
-- blocked sender's reply is marked `ignored` on the way in, so extraction
-- never selects it and we never pay to read a quote we would not take.
--
-- Nothing is destroyed. The email is kept exactly as received, as every reply
-- is; only its status changes, and unblocking puts it back in the queue.
--
-- Written to survive being run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.sourcing_blocklist (
  id uuid primary key default gen_random_uuid(),

  email text,
  domain text,

  note text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),

  check (email is not null or domain is not null)
);

comment on table public.sourcing_blocklist is
  'Publishers and resellers we will not buy from, by address or by company domain. Internal only - no customer-facing policy exists, deliberately. Enforced by a trigger on inbound_emails.';

create unique index if not exists sourcing_blocklist_email_idx
  on public.sourcing_blocklist (lower(email)) where email is not null;
create unique index if not exists sourcing_blocklist_domain_idx
  on public.sourcing_blocklist (lower(domain)) where domain is not null;

alter table public.sourcing_blocklist enable row level security;

do $$
begin
  create policy "Admins manage the sourcing blocklist"
    on public.sourcing_blocklist for all
    using (public.is_admin()) with check (public.is_admin());
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.sourcing_sender_blocked(p_address text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sourcing_blocklist b
    where (
            b.email is not null
            and lower(btrim(b.email)) = lower(btrim(coalesce(p_address, '')))
          )
       or (
            b.domain is not null
            and position('@' in coalesce(p_address, '')) > 0
            and regexp_replace(lower(btrim(substring(p_address from '[^@]*$'))), '^www\.', '')
                = regexp_replace(lower(btrim(b.domain)), '^www\.', '')
          )
  );
$$;

comment on function public.sourcing_sender_blocked(text) is
  'True when this sender is on the blocklist, by exact address or by the domain after the last @. Matches senderDomain() in lib/sourcing/offers.ts: lowercased, trimmed, leading www. removed.';

create or replace function public.inbound_emails_refuse_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.sourcing_sender_blocked(new.from_address) then
    new.status := 'ignored';
    new.status_reason := 'Sender blocked';
  end if;
  return new;
end;
$$;

do $$
begin
  create trigger inbound_emails_refuse_blocked
    before insert on public.inbound_emails
    for each row execute function public.inbound_emails_refuse_blocked();
exception
  when duplicate_object then null;
end;
$$;

create or replace function public.sourcing_block_sender(
  p_email text default null,
  p_domain text default null,
  p_note text default null,
  p_by text default null
)
returns table (drafts_removed integer, emails_ignored integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(btrim(lower(coalesce(p_email, ''))), '');
  v_domain text := nullif(regexp_replace(btrim(lower(coalesce(p_domain, ''))), '^www\.', ''), '');
  v_drafts integer := 0;
  v_emails integer := 0;
begin
  if v_email is null and v_domain is null then
    raise exception 'A block needs an address or a domain.';
  end if;

  insert into public.sourcing_blocklist (email, domain, note, created_by)
  values (v_email, v_domain, nullif(btrim(coalesce(p_note, '')), ''), p_by)
  on conflict do nothing;

  with gone as (
    delete from public.listing_drafts d
    using public.inbound_emails e
    where d.email_id = e.id
      and d.status = 'pending'
      and public.sourcing_sender_blocked(e.from_address)
    returning d.id
  )
  select count(*)::integer into v_drafts from gone;

  with hushed as (
    update public.inbound_emails e
    set status = 'ignored', status_reason = 'Sender blocked'
    where e.status = 'new'
      and public.sourcing_sender_blocked(e.from_address)
    returning e.id
  )
  select count(*)::integer into v_emails from hushed;

  return query select v_drafts, v_emails;
end;
$$;

comment on function public.sourcing_block_sender(text, text, text, text) is
  'Block a sender and apply it to what is already here: delete their waiting drafts and mark their unread replies ignored. Only pending drafts go - an approved one is where a listing price came from, and deleting it would destroy that record without touching the listing.';

create or replace function public.sourcing_unblock_sender(p_value text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value text := regexp_replace(btrim(lower(coalesce(p_value, ''))), '^www\.', '');
  v_restored integer := 0;
begin
  delete from public.sourcing_blocklist b
  where lower(btrim(b.email)) = v_value
     or regexp_replace(lower(btrim(b.domain)), '^www\.', '') = v_value;

  with woken as (
    update public.inbound_emails e
    set status = 'new', status_reason = null
    where e.status = 'ignored'
      and e.status_reason = 'Sender blocked'
      and not public.sourcing_sender_blocked(e.from_address)
    returning e.id
  )
  select count(*)::integer into v_restored from woken;

  return v_restored;
end;
$$;

comment on function public.sourcing_unblock_sender(text) is
  'Lift a block and put the replies it silenced back in the extraction queue. The blocked check is re-run per row, so lifting an address block on somebody whose whole domain is also blocked wakes nothing. Replies already read before the block stay read - their drafts are gone and re-reading them would be a second charge.';

-- ---------------------------------------------------------------------------
-- Who may call these.
--
-- `security definer` runs as the owner and therefore straight past row level
-- security, and PostgREST publishes every function in `public` as an RPC
-- endpoint. PostgreSQL grants EXECUTE to PUBLIC by default, so without the
-- lines below an unauthenticated caller could POST to /rpc/sourcing_block_sender
-- and delete drafts, or read who we buy from through the blocked check.
--
-- Measured rather than assumed: before these were added, `set role anon;
-- select * from sourcing_block_sender('evil@test.test', ...)` returned 0|0 and
-- left a row in the blocklist. The same convention as 0057, 0058 and 0059.
-- ---------------------------------------------------------------------------

revoke all on function public.sourcing_sender_blocked(text) from public;
revoke all on function public.sourcing_sender_blocked(text) from anon;
revoke all on function public.sourcing_sender_blocked(text) from authenticated;

revoke all on function public.inbound_emails_refuse_blocked() from public;
revoke all on function public.inbound_emails_refuse_blocked() from anon;
revoke all on function public.inbound_emails_refuse_blocked() from authenticated;

revoke all on function public.sourcing_block_sender(text, text, text, text) from public;
revoke all on function public.sourcing_block_sender(text, text, text, text) from anon;
revoke all on function public.sourcing_block_sender(text, text, text, text) from authenticated;

revoke all on function public.sourcing_unblock_sender(text) from public;
revoke all on function public.sourcing_unblock_sender(text) from anon;
revoke all on function public.sourcing_unblock_sender(text) from authenticated;
