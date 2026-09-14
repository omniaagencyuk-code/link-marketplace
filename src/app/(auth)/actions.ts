'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { userService } from '@/lib/services';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_SECONDS,
  createCustomerSessionToken,
  isCustomerAuthConfigured,
} from '@/lib/auth/customer-session';

/**
 * Customer sign-in, sign-up and sign-out.
 *
 * Credentials are still mocked - any email signs in, and sign-up creates a
 * profile in the in-memory store. What is *not* mocked is the session: a
 * signed cookie is issued here and verified on the server for every protected
 * request, so marketplace access is real access control rather than a
 * browser-side flag. Connecting Supabase means replacing the lookup below
 * with `supabase.auth.signInWithPassword` / `signUp` and keeping the rest.
 */

export interface AuthActionState {
  error?: string;
}

/** Only same-origin paths, so a crafted `next` cannot bounce a user offsite. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  if (!path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  return path;
}

async function issueSession(userId: string, email: string): Promise<boolean> {
  const token = await createCustomerSessionToken(userId, email);
  if (!token) return false;

  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CUSTOMER_SESSION_TTL_SECONDS,
  });
  return true;
}

const notConfigured =
  'Sign-in is not available: this deployment is missing AUTH_SESSION_SECRET. Add it and redeploy.';

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isCustomerAuthConfigured()) return { error: notConfigured };

  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Enter the email address on your account.' };

  const user = await userService.findOrCreateByEmail(email);
  if (!(await issueSession(user.id, user.email))) return { error: notConfigured };

  revalidatePath('/', 'layout');
  redirect(safeRedirect(formData.get('next')));
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isCustomerAuthConfigured()) return { error: notConfigured };

  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Enter your email address.' };

  const user = await userService.findOrCreateByEmail(email, {
    fullName: String(formData.get('name') ?? '').trim() || undefined,
    company: String(formData.get('company') ?? '').trim() || undefined,
  });
  if (!(await issueSession(user.id, user.email))) return { error: notConfigured };

  revalidatePath('/', 'layout');
  redirect(safeRedirect(formData.get('next')));
}

export async function signOutAction() {
  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/');
}
