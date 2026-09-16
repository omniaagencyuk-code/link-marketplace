'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { userService } from '@/lib/services';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { getServerClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/config/brand';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_TTL_SECONDS,
  createCustomerSessionToken,
  isCustomerAuthConfigured,
} from '@/lib/auth/customer-session';
import { RATE_LIMITS, consumeRateLimit, rateLimitMessage } from '@/lib/auth/rate-limit';

/**
 * Customer sign-in, sign-up, sign-out and password reset.
 *
 * Two implementations behind one set of actions. With Supabase connected these
 * are real credentials: a password Supabase hashes and checks, email
 * confirmation, and a session the auth server can revoke. Without it, the
 * original mock stands in - any email signs in - so the app still runs from a
 * clone with no configuration.
 *
 * The form components do not know which is active. That is deliberate: it is
 * the same contract either way, and it is what let the marketplace be gated
 * before the database existed.
 */

export interface AuthActionState {
  error?: string;
  /** Shown instead of a redirect, e.g. "check your email". */
  notice?: string;
}

/** Only same-origin paths, so a crafted `next` cannot bounce a user offsite. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === 'string' ? value : '';
  if (!path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  return path;
}

/**
 * Supabase returns deliberately vague errors on sign-in, which is correct -
 * telling an attacker whether an address exists is a gift. These map the few
 * cases worth rephrasing and pass everything else through.
 */
function readableAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (text.includes('email not confirmed')) {
    return 'Check your email and confirm your address before signing in.';
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'An account already exists for that email. Try logging in instead.';
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (text.includes('password')) return message;
  return 'Something went wrong. Try again.';
}

// ---------------------------------------------------------------- mock mode

const notConfigured =
  'Sign-in is not available: this deployment is missing AUTH_SESSION_SECRET. Add it and redeploy.';

async function issueMockSession(userId: string, email: string): Promise<boolean> {
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

// -------------------------------------------------------------------- actions

export async function signInAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email) return { error: 'Enter the email address on your account.' };

  // Counted before the credentials are checked, so a wrong password costs an
  // attempt. Checking afterwards would leave brute force unthrottled.
  const throttle = await consumeRateLimit(RATE_LIMITS.signIn);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  if (isSupabaseEnabled()) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: readableAuthError(error.message) };
  } else {
    if (!isCustomerAuthConfigured()) return { error: notConfigured };
    const user = await userService.findOrCreateByEmail(email);
    if (!(await issueMockSession(user.id, user.email))) return { error: notConfigured };
  }

  revalidatePath('/', 'layout');
  redirect(safeRedirect(formData.get('next')));
}

export async function signUpAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('name') ?? '').trim();
  const company = String(formData.get('company') ?? '').trim();
  if (!email) return { error: 'Enter your email address.' };

  const throttle = await consumeRateLimit(RATE_LIMITS.signUp);
  if (!throttle.allowed) return { error: rateLimitMessage(throttle) };

  if (isSupabaseEnabled()) {
    if (password.length < 8) return { error: 'Use a password of at least 8 characters.' };

    const next = safeRedirect(formData.get('next'));
    const supabase = await getServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Carried into the profiles row by the handle_new_user trigger.
        data: { full_name: fullName, company: company || null },
        emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return { error: readableAuthError(error.message) };

    // With email confirmation on, sign-up returns a user but no session. Say
    // so plainly rather than redirecting to a dashboard that will bounce them
    // straight back to the login form.
    if (!data.session) {
      return {
        notice:
          'Check your email to confirm your address. The link will bring you straight back here.',
      };
    }
  } else {
    if (!isCustomerAuthConfigured()) return { error: notConfigured };
    const user = await userService.findOrCreateByEmail(email, {
      fullName: fullName || undefined,
      company: company || undefined,
    });
    if (!(await issueMockSession(user.id, user.email))) return { error: notConfigured };
  }

  revalidatePath('/', 'layout');
  redirect(safeRedirect(formData.get('next')));
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
  if (error) return { error: readableAuthError(error.message) };

  return { notice: 'Password updated.' };
}
