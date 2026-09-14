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

export interface AdminLoginState {
  error?: string;
}

/** Only ever send an admin back to an admin URL. */
function safeRedirectTarget(value: string | null): string {
  if (!value || !value.startsWith('/admin') || value.startsWith('//')) return '/admin';
  if (value === '/admin/login') return '/admin';
  return value;
}

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
