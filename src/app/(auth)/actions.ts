'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config/brand';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/auth/customer-session';
import { RATE_LIMITS, consumeRateLimit, rateLimitMessage } from '@/lib/auth/rate-limit';
import { readableAuthError } from '@/lib/auth/credentials';

/**
 * Signing out, and the two password forms.
 *
 * Sign-in and sign-up used to be here too and are not any more. A server
 * action is addressed by an id Next.js bakes into the client bundle, so a
 * deploy invalidates every page a browser already has open and the next
 * submit is refused with "Failed to find Server Action" - which on /signup
 * is somebody who wanted an account and did not get one. They post to
 * `src/app/api/auth/` now, where the address is a URL and a URL survives a
 * deploy.
 *
 * What is left is here on purpose rather than by omission. Signing out is
 * reached from a button that is re-rendered on every navigation, and the
 * password forms are retried by anybody who means it; neither has shown a
 * single refusal. They are the same class of fragility all the same, and
 * moving them is a change to make on its own rather than inside this one.
 *
 * Two implementations still stand behind these: with Supabase connected
 * these are real credentials, and without it the original mock stands in so
 * the app runs from a clone with no configuration.
 */

export interface AuthActionState {
  error?: string;
  /** Shown instead of a redirect, e.g. "check your email". */
  notice?: string;
}

export async function signOutAction() {
  if (isSupabaseEnabled()) {
    const supabase = await getServerClient();
    await supabase.auth.signOut();
  }

  // Clear the mock cookie too, so switching data sources cannot leave a stale
  // session behind.
  const store = await cookies();
  store.delete(CUSTOMER_SESSION_COOKIE);

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function requestPasswordResetAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Enter your email address.' };

  // Throttled for two reasons: it sends mail, and an unthrottled reset form is
  // a way to spray a mailbox on someone else's behalf.
  const throttle = await consumeRateLimit(RATE_LIMITS.passwordReset);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  if (!isSupabaseEnabled()) {
    return {
      error: 'Password reset needs the database connected. Ask the team to reset it for you.',
    };
  }

  const supabase = await getServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=%2Fdashboard%2Faccount`,
  });

  // Always the same answer, whether or not the address exists. Confirming
  // which emails have accounts is a free gift to anyone probing.
  return {
    notice: 'If that address has an account, a reset link is on its way.',
  };
}

export async function updatePasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  if (!isSupabaseEnabled()) return { error: 'Changing your password needs the database connected.' };

  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };

  const throttle = await consumeRateLimit(RATE_LIMITS.passwordUpdate);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  const supabase = await getServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: readableAuthError(error.message).message };

  return { notice: 'Password updated.' };
}
