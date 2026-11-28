import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { safeReturnPath } from '@/lib/auth/return-to';
import { authMessage } from '@/lib/auth/messages';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Press Parrot account to manage orders, saved websites and billing.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

/**
 * What `?error=` may say, as opposed to `?failed=`.
 *
 * Two senders, and neither is a refused credential. `/auth/confirm` sends
 * `link-expired` when a one-time link has been used or has expired, and
 * `/api/auth/google` sends `google-unavailable` when it was asked for a
 * provider this deployment has not configured - which should be unreachable,
 * because the button is behind the same check, and is handled anyway because
 * a form can be posted by hand.
 *
 * Drawn above the form as a warning about a link. A wrong password arrives
 * as `?failed=` instead and is drawn inside the form beside the fields,
 * which is why there are two params rather than one the page has to tell
 * apart by reading the code.
 */
const LINK_PROBLEMS = new Set(['link-expired', 'google-unavailable']);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  // Already signed in: no reason to show the form again.
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  const code = typeof params.error === 'string' ? params.error : undefined;
  const problem = code && LINK_PROBLEMS.has(code) ? authMessage(code) : undefined;

  return (
    <>
      {problem ? (
        <p
          role="alert"
          className="mb-5 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      ) : null}
      <AuthForm
        mode="login"
        next={next}
        initial={{ error: authMessage(params.failed), notice: authMessage(params.notice) }}
      />
    </>
  );
}
