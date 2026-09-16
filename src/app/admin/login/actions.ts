'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  isAdminAuthConfigured,
  isAdminEmail,
  verifyAdminPassword,
} from '@/lib/auth/admin-access';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
} from '@/lib/auth/admin-session';
import { RATE_LIMITS, consumeRateLimit, rateLimitMessage } from '@/lib/auth/rate-limit';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';

export interface AdminLoginState {
  error?: string;
  /** Shown when the credentials were right but the account is not an admin. */
  notice?: string;
}

/**
 * Sign in with a Press Parrot account that carries the admin role.
 *
 * The replacement for the shared password. Each administrator gets their own
 * identity, which means `auth.uid()` is populated, `is_admin()` returns true
 * and row level security enforces admin access in the database rather than
 * only in the application.
 *
 * A valid account without the role is left signed in rather than being
 * forcibly signed out: they authenticated correctly, they are simply not an
 * administrator, and quietly dropping their session would be surprising.
 */
export async function signInAdminWithAccountAction(
  _previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const throttle = await consumeRateLimit(RATE_LIMITS.adminSignIn);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  if (!isSupabaseEnabled()) {
    return { error: 'Account sign-in needs the database connected on this deployment.' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const target = safeRedirectTarget(
    typeof formData.get('next') === 'string' ? String(formData.get('next')) : null,
  );

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    // One message whatever went wrong, so the form cannot be used to work out
    // which addresses have accounts.
    return { error: 'Those details are not recognised.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'admin') {
    return {
      notice:
        'That account does not have admin access. Ask an existing admin to grant it, or go to your dashboard.',
    };
  }

  redirect(target);
}

/** Only ever send an admin back to an admin URL. */
function safeRedirectTarget(value: string | null): string {
  if (!value || !value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  if (value === '/admin/login') return '/admin';
  return value;
}

/**
 * The shared password. Transitional - see `lib/auth/admin-access`.
 *
 * Kept so that enabling account sign-in cannot lock the team out before
 * anyone has been granted the admin role. Remove this, ADMIN_PASSWORD and
 * ADMIN_EMAILS once every administrator has an account.
 */
export async function signInAdminAction(
  _previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  if (!isAdminAuthConfigured()) {
    return {
      error:
        'Admin sign-in is not configured on this deployment. Set ADMIN_EMAILS, ADMIN_PASSWORD and ADMIN_SESSION_SECRET.',
    };
  }

  // The tightest limit on the site: one shared password guards the whole admin
  // area, so this is the single most valuable thing on it to guess.
  const throttle = await consumeRateLimit(RATE_LIMITS.adminSignIn);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const target = safeRedirectTarget(
    typeof formData.get('next') === 'string' ? String(formData.get('next')) : null,
  );

  // One message for both failure modes, so the form cannot be used to
  // discover which addresses are admins.
  if (!isAdminEmail(email) || !verifyAdminPassword(password)) {
    return { error: 'Those details are not recognised.' };
  }

  const token = await createAdminSessionToken(email.trim().toLowerCase());
  if (!token) return { error: 'Admin sign-in is not configured on this deployment.' };

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  redirect(target);
}

export async function signOutAdminAction() {
  const store = await cookies();
  store.delete({ name: ADMIN_SESSION_COOKIE, path: '/admin' });
  redirect('/admin/login');
}
