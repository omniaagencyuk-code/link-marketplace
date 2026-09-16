-- ---------------------------------------------------------------------------
-- Admins as real accounts
--
-- The admin area signs in with one shared password and an allowlist of email
-- addresses held in an environment variable. That has two consequences worth
-- fixing: requests from the admin carry no Supabase identity at all, so
-- auth.uid() is null and every row level security policy treats an
-- administrator as a stranger; and because the password is shared, nothing
-- records which person did what.
--
-- Admins become ordinary Supabase Auth accounts with profiles.role = 'admin'.
-- is_admin() already reads exactly that, so every policy written so far starts
-- working for admins with no change.
--
-- This migration only provides the means. Granting the first admin is a
-- deliberate manual step - see the comment on grant_admin below - because a
-- migration that promoted an address automatically would hand out admin to
-- whoever registered it first.
-- ---------------------------------------------------------------------------

/**
 * Promote an existing account to admin.
 *
 * The account has to exist: the person signs up normally first, and is then
 * granted. Returns false when no profile matches, rather than creating one,
 * so a typo cannot pre-authorise an address nobody has registered yet.
 *
 * Restricted to admins, with one exception below for the very first one.
 */
create or replace function public.grant_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can grant admin access';
  end if;

  update public.profiles
     set role = 'admin', updated_at = timezone('utc', now())
   where lower(email) = lower(trim(p_email));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.grant_admin(text) from public;
grant execute on function public.grant_admin(text) to authenticated;

/** The mirror image, so access can be taken away as easily as given. */
create or replace function public.revoke_admin(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can revoke admin access';
  end if;

  -- Removing the last admin would leave nobody able to grant it back.
  if (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Cannot remove the last remaining admin';
  end if;

  update public.profiles
     set role = 'customer', updated_at = timezone('utc', now())
   where lower(email) = lower(trim(p_email));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.revoke_admin(text) from public;
grant execute on function public.revoke_admin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Granting the first admin
--
-- There is no admin yet, so grant_admin() cannot be used to make one. Run this
-- once in the SQL editor, as the project owner, after the person has signed up
-- and confirmed their email:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Check it took:
--
--   select email, role from public.profiles where role = 'admin';
--
-- After that, further admins can be granted through the application.
-- ---------------------------------------------------------------------------

-- An index, because every admin page load asks this question.
create index if not exists profiles_role_idx on public.profiles (role) where role = 'admin';
