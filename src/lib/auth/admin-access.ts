import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
  type AdminSession,
} from './admin-session';

/**
 * Who may reach the admin area, and how they prove it.
 *
 * This is a deliberate stopgap until Supabase Auth is connected: a shared
 * password plus an allowlist of addresses, both supplied as server-only
 * environment variables. It is server-enforced, unlike the previous
 * development guard, but it is not per-user identity. When Supabase lands,
 * replace `verifyAdminPassword` with a real sign-in and keep the allowlist as
 * the `profiles.role` check.
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

/** The signed-in admin, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const session = await verifyAdminSessionToken(store.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) return null;
  // An address removed from the allowlist loses access on its next request,
  // without waiting for the token to expire.
  if (!isAdminEmail(session.email)) return null;
  return session;
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
