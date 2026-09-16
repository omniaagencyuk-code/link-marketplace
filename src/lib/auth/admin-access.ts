import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  verifyAdminSessionToken,
  type AdminSession as SignedAdminSession,
} from './admin-session';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';

/**
 * A verified administrator.
 *
 * `source` says which route they came in by, which matters: only a
 * 'supabase' admin carries an identity the database can see.
 */
export interface AdminSession extends SignedAdminSession {
  source: 'supabase' | 'shared-password';
}

/**
 * Who may reach the admin area, and how they prove it.
 *
 * Two ways in, on purpose, while the first is being retired:
 *
 * 1. A Supabase Auth account whose profile carries role = 'admin'. This is the
 *    real one. It gives each administrator their own identity, so
 *    `auth.uid()` is populated, `is_admin()` returns true, and row level
 *    security enforces admin access in the database rather than only in the
 *    application.
 *
 * 2. The shared password and the ADMIN_EMAILS allowlist. Kept so that turning
 *    on the first method cannot lock the team out of their own admin before
 *    anyone has been granted the role. Remove it - the env vars and
 *    `verifyAdminPassword` - once every administrator can sign in the first
 *    way.
 *
 * Until (2) is gone, admin database calls must keep using the service-role
 * client: an administrator signed in that way still has no `auth.uid()`, so
 * RLS would refuse them.
 */

/** Addresses permitted to sign in, from the ADMIN_EMAILS variable. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const allowed = adminEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

/** Length-independent comparison, so failures leak no timing signal. */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return false;
  return timingSafeEqual(candidate, expected);
}

/** True when every variable the admin sign-in needs is present. */
export function isAdminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_SESSION_SECRET && process.env.ADMIN_PASSWORD && adminEmails().length > 0,
  );
}

/**
 * The Supabase account behind this request, when it is an admin.
 *
 * `getUser()` revalidates against the auth server; `getSession()` would read
 * the cookie and believe it, which is not enough to gate anything. The role
 * is read from `profiles` rather than from the token, so revoking admin takes
 * effect on the next request instead of whenever the session expires.
 */
async function getSupabaseAdmin(): Promise<AdminSession | null> {
  if (!isSupabaseEnabled()) return null;

  const supabase = await getServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'admin') return null;

  return {
    email: (profile.email as string) ?? user.email ?? '',
    // Supabase owns the real expiry; this is only here to satisfy the shape
    // the legacy cookie path produces.
    exp: Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000,
    source: 'supabase',
  };
}

/** The shared-password session. Transitional - see the note at the top. */
async function getSharedPasswordAdmin(): Promise<AdminSession | null> {
  const store = await cookies();
  const session = await verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;
  // An address removed from the allowlist loses access on its next request,
  // without waiting for the token to expire.
  if (!isAdminEmail(session.email)) return null;
  return { ...session, source: 'shared-password' };
}

/** The signed-in admin, by either route, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  return (await getSupabaseAdmin()) ?? (await getSharedPasswordAdmin());
}

/**
 * Guard for admin server actions. Server actions have their own endpoints and
 * are callable without rendering a page, so proxy.ts alone is not enough.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
