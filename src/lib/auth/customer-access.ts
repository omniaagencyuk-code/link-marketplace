import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { userService } from '@/lib/services/user-service';
import {
  CUSTOMER_SESSION_COOKIE,
  verifyCustomerSessionToken,
  type CustomerSession,
} from './customer-session';
import type { UserProfile } from '@/lib/types';

/**
 * Server-side view of the signed-in customer.
 *
 * Every protected page and server action resolves the current account through
 * this module, so there is exactly one place that decides whether a request is
 * authenticated. `proxy.ts` performs the same check earlier in the request, but
 * it cannot be the only one: server actions have their own endpoints.
 */

/** The verified session, or null. */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  return verifyCustomerSessionToken(store.get(CUSTOMER_SESSION_COOKIE)?.value);
}

/** The signed-in account profile, or null when signed out. */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const session = await getCustomerSession();
  if (!session) return null;
  const user = await userService.getById(session.sub);
  // A deleted account loses access on its next request rather than waiting for
  // the token to expire.
  return user ?? null;
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
