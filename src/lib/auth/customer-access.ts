import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { userService } from '@/lib/services/user-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';
import {
  CUSTOMER_SESSION_COOKIE,
  verifyCustomerSessionToken,
  type CustomerSession,
} from './customer-session';
import type { UserProfile } from '@/lib/types';

/**
 * Server-side view of the signed-in customer.
 *
 * Two implementations behind one function, chosen by whether Supabase is
 * connected:
 *
 * - Supabase: the real session, from `auth.getUser()`. That call verifies the
 *   token with the auth server rather than trusting whatever the cookie says,
 *   which is the difference between a session and a claim.
 * - Mock: the signed HMAC cookie, which is what protected the marketplace
 *   before the database existed.
 *
 * Every protected page and server action resolves the current account through
 * here, so there is exactly one place that decides whether a request is
 * authenticated. `proxy.ts` performs the same check earlier in the request,
 * but it cannot be the only one: server actions have their own endpoints.
 */

/** The verified session, or null. Mock mode only - prefer `getCurrentUser`. */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  return verifyCustomerSessionToken(store.get(CUSTOMER_SESSION_COOKIE)?.value);
}

/** The signed-in account profile, or null when signed out. */
export async function getCurrentUser(): Promise<UserProfile | null> {
  if (isSupabaseEnabled()) return getSupabaseUser();

  const session = await getCustomerSession();
  if (!session) return null;
  const user = await userService.getById(session.sub);
  // A deleted account loses access on its next request rather than waiting for
  // the token to expire.
  return user ?? null;
}

async function getSupabaseUser(): Promise<UserProfile | null> {
  const supabase = await getServerClient();

  // getUser() re-validates against the auth server. getSession() would read
  // the cookie and believe it, which is not good enough to gate anything.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, company, role, plan, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  // The profiles row is created by a trigger on auth.users, but a sign-up can
  // be observed in the gap before it lands. Fall back to the auth record so a
  // brand new account is not treated as signed out.
  if (!profile) {
    const email = user.email ?? '';
    return {
      id: user.id,
      email,
      fullName: (user.user_metadata?.full_name as string) || email.split('@')[0] || 'Account',
      company: (user.user_metadata?.company as string) || undefined,
      role: 'customer',
      avatarInitials: initialsFor(
        (user.user_metadata?.full_name as string) || email,
        email,
      ),
      plan: 'starter',
      createdAt: user.created_at,
      updatedAt: user.created_at,
    };
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name || profile.email.split('@')[0] || 'Account',
    company: profile.company ?? undefined,
    role: profile.role,
    avatarInitials: initialsFor(profile.full_name, profile.email),
    plan: profile.plan as UserProfile['plan'],
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function initialsFor(name: string, email: string) {
  const source = (name || '').trim() || email.split('@')[0]?.replace(/[._-]+/g, ' ') || '';
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('');
  return (initials || email.charAt(0) || '?').toUpperCase();
}

/**
 * Guard for protected pages and customer server actions.
 *
 * `returnTo` is preserved so sign-in lands the customer back where they were
 * headed instead of on a generic dashboard.
 */
export async function requireCustomerSession(returnTo?: string): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (user) return user;

  const target = returnTo && returnTo.startsWith('/') ? returnTo : null;
  redirect(target ? `/login?next=${encodeURIComponent(target)}` : '/login');
}
