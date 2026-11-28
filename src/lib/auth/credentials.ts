import { cookies } from 'next/headers';
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
import { DEMO_DATA_MESSAGE, isServingDemoDataLive } from '@/lib/config/deployment';
import { safeReturnPath } from '@/lib/auth/return-to';
import { AUTH_MESSAGES, type AuthMessageCode } from '@/lib/auth/messages';

/**
 * What happens when somebody types an email and a password.
 *
 * This was two server actions, and it moved here because of how they failed.
 * A server action is addressed by an id that Next.js bakes into the client
 * bundle at build time, so a deploy invalidates every page already open in
 * somebody's browser: the next submit posts an id the new deployment has
 * never heard of and Next refuses it with "Failed to find Server Action".
 * The person sees a form that does nothing. Between 28 October and 27
 * November that happened twelve times on /signup, and it will happen on
 * every deploy for as long as the door into the product is an action id.
 *
 * So the rule lives here, as ordinary functions, and the route handlers in
 * `src/app/api/auth/` are what the form posts to. A URL is stable across
 * deploys; an action id is not. The form also works with JavaScript off,
 * which it did not before - `useActionState` could run the action but had
 * nowhere to render what came back.
 *
 * One copy, deliberately. Sign-in and sign-up differ in four lines and
 * agree about everything that matters - the throttle before the credential
 * check, the refusal on the live demo, where a `next` may point - and two
 * copies of that is one copy that stops being true.
 */

/** Where somebody lands when they did not ask for anywhere in particular. */
export const DEFAULT_LANDING = '/dashboard';

/**
 * Where to send somebody after a successful attempt.
 *
 * The raw form value goes in, not a checked one. A caller that has to
 * remember to sanitise is a caller that eventually forgets, and the whole
 * value of `safeReturnPath` is that there is one of it - this is its fourth
 * reader rather than a fifth rule.
 */
export function landingFor(value: string | null | undefined): string {
  return safeReturnPath(value) ?? DEFAULT_LANDING;
}

/**
 * What an attempt decided.
 *
 * Both a `code` and a `message`, which look redundant and are not. The
 * message is the precise thing to show - "Try again in 41 seconds", or
 * whatever Supabase said about a password - and the code is the part that
 * can survive a redirect. A browser running JavaScript gets the message; one
 * without it gets the code and reads the fallback above.
 */
export type CredentialOutcome =
  | { kind: 'signed-in'; next: string }
  | { kind: 'notice'; code: AuthMessageCode; message: string }
  | { kind: 'error'; code: AuthMessageCode; message: string };

const fail = (code: AuthMessageCode, message?: string): CredentialOutcome => ({
  kind: 'error',
  code,
  message: message ?? AUTH_MESSAGES[code],
});

/**
 * Supabase returns deliberately vague errors on sign-in, which is correct -
 * telling an attacker whether an address exists is a gift. These map the few
 * cases worth rephrasing and pass everything else through.
 *
 * The password case keeps Supabase's own wording, because it names the rule
 * that was broken. That is the one message with no fixed code behind it, so
 * a reader without JavaScript gets the generic version instead.
 */
export function readableAuthError(message: string): { code: AuthMessageCode; message: string } {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) {
    return { code: 'invalid', message: AUTH_MESSAGES.invalid };
  }
  if (text.includes('email not confirmed')) {
    return { code: 'unconfirmed', message: AUTH_MESSAGES.unconfirmed };
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return { code: 'exists', message: AUTH_MESSAGES.exists };
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return { code: 'rate-limit', message: AUTH_MESSAGES['rate-limit'] };
  }
  if (text.includes('password')) return { code: 'password', message };
  return { code: 'unknown', message: AUTH_MESSAGES.unknown };
}

// ---------------------------------------------------------------- mock mode

const notConfigured =
  'Sign-in is not available: this deployment is missing AUTH_SESSION_SECRET. Add it and redeploy.';

/**
 * The mock branch refused on the live domain.
 *
 * Mock mode signs in any address typed into the form and creates an account
 * for it. On a clone and on a preview deploy that is the feature - it is what
 * let the marketplace be reviewed before a database existed. On
 * pressparrot.com it is a stranger signing in as somebody else's work
 * address, which is not a degraded experience, it is an open door.
 *
 * So the live domain fails closed here rather than falling through. The band
 * in the root layout says the same thing to anybody looking at the site; this
 * says it to the one person who tried to act on it, and names what to set.
 */
const demoAuthRefused = `Sign-in is unavailable: ${DEMO_DATA_MESSAGE}`;

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

/**
 * The one path to a mock session, for sign-in and sign-up alike.
 *
 * It was two, which meant the refusal above had to be written twice and
 * stay written twice. Returns a refusal, or nothing when a session was
 * issued. The live-site check comes first and touches neither cookies nor
 * the database, so it can be asserted against directly.
 */
export async function mockCredentials(
  email: string,
  profile?: { fullName?: string; company?: string },
): Promise<CredentialOutcome | undefined> {
  if (isServingDemoDataLive()) return fail('unavailable', demoAuthRefused);
  if (!isCustomerAuthConfigured()) return fail('unavailable', notConfigured);

  const user = await userService.findOrCreateByEmail(email, profile);
  if (!(await issueMockSession(user.id, user.email))) return fail('unavailable', notConfigured);
  return undefined;
}

// --------------------------------------------------------------- the attempts

export interface SignInInput {
  email: string;
  password: string;
  /** Raw, as it arrived from the form. Checked by `landingFor`, not by the caller. */
  next: string | null | undefined;
}

export interface SignUpInput extends SignInInput {
  fullName: string;
  company: string;
}

export async function attemptSignIn(input: SignInInput): Promise<CredentialOutcome> {
  const email = input.email.trim();
  if (!email) return fail('email-missing', 'Enter the email address on your account.');

  // Counted before the credentials are checked, so a wrong password costs an
  // attempt. Checking afterwards would leave brute force unthrottled.
  const throttle = await consumeRateLimit(RATE_LIMITS.signIn);
  if (!throttle.allowed) return fail('rate-limit', rateLimitMessage(throttle));

  if (isSupabaseEnabled()) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (error) {
      const read = readableAuthError(error.message);
      return { kind: 'error', code: read.code, message: read.message };
    }
  } else {
    const refusal = await mockCredentials(email);
    if (refusal) return refusal;
  }

  return { kind: 'signed-in', next: landingFor(input.next) };
}

export async function attemptSignUp(input: SignUpInput): Promise<CredentialOutcome> {
  const email = input.email.trim();
  const fullName = input.fullName.trim();
  const company = input.company.trim();
  if (!email) return fail('email-missing');

  const throttle = await consumeRateLimit(RATE_LIMITS.signUp);
  if (!throttle.allowed) return fail('rate-limit', rateLimitMessage(throttle));

  const next = landingFor(input.next);

  if (isSupabaseEnabled()) {
    if (input.password.length < 8) return fail('password');

    const supabase = await getServerClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        // Carried into the profiles row by the handle_new_user trigger.
        data: { full_name: fullName, company: company || null },
        emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      const read = readableAuthError(error.message);
      return { kind: 'error', code: read.code, message: read.message };
    }

    // With email confirmation on, sign-up returns a user but no session. Say
    // so plainly rather than redirecting to a dashboard that will bounce them
    // straight back to the login form.
    if (!data.session) {
      return {
        kind: 'notice',
        code: 'confirm-email',
        message: AUTH_MESSAGES['confirm-email'],
      };
    }
  } else {
    // Sign-up too: an account created here is a mock account, and one made on
    // the live domain is a customer who believes they have registered.
    const refusal = await mockCredentials(email, {
      fullName: fullName || undefined,
      company: company || undefined,
    });
    if (refusal) return refusal;
  }

  return { kind: 'signed-in', next };
}
