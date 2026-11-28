/**
 * Every sentence the sign-in and sign-up flow can say, by code.
 *
 * Codes rather than text, because a failed attempt without JavaScript comes
 * back as a redirect and anything in that URL is chosen by whoever wrote the
 * link. React would escape an arbitrary message, so this is not about
 * scripting - it is that `?failed=Your%20account%20is%20suspended,%20email...`
 * on our own login page is a phishing kit we would be hosting. A closed set
 * of codes cannot say anything we did not write.
 *
 * `link-expired` and `google-unavailable` were spelled out on the login page
 * and are here for the same reason the rest are: one place to read what this
 * flow tells people.
 *
 * Its own module rather than part of `credentials.ts`, because this is copy
 * and that is behaviour: a page that only needs to turn a code back into a
 * sentence should not have to import cookies, the rate limiter and the user
 * service to do it.
 */
export const AUTH_MESSAGES = {
  'email-missing': 'Enter your email address.',
  invalid: 'That email and password do not match an account.',
  unconfirmed: 'Check your email and confirm your address before signing in.',
  exists: 'An account already exists for that email. Try logging in instead.',
  password: 'Use a password of at least 8 characters.',
  'rate-limit': 'Too many attempts. Wait a minute and try again.',
  unavailable: 'Sign-in is unavailable on this deployment.',
  unknown: 'Something went wrong. Try again.',
  'confirm-email':
    'Check your email to confirm your address. The link will bring you straight back here.',
  offline: 'Could not reach the server. Check your connection and try again.',
  'link-expired': 'That link has expired or has already been used. Log in, or request a new one.',
  'google-unavailable':
    'Google sign-in is not available on this deployment. Use your email and password.',
} as const satisfies Record<string, string>;

export type AuthMessageCode = keyof typeof AUTH_MESSAGES;

/** The sentence a code stands for, or nothing when it stands for none. */
export function authMessage(value: string | string[] | null | undefined): string | undefined {
  const code = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;
  if (!code) return undefined;
  return (AUTH_MESSAGES as Record<string, string>)[code];
}

