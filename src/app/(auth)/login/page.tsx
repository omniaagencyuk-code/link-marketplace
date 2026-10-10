import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { safeReturnPath } from '@/lib/auth/return-to';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Press Parrot account to manage orders, saved websites and billing.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  // Already signed in: no reason to show the form again.
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  /*
    Two senders. `/auth/confirm` when a one-time link has expired or been
    used, and `signInWithGoogleAction` when it was asked for a provider this
    deployment has not configured - which should be unreachable, because the
    button is behind the same check, and is handled anyway because a form can
    be posted by hand.
  */
  const problem =
    params.error === 'link-expired'
      ? 'That link has expired or has already been used. Log in, or request a new one.'
      : params.error === 'google-unavailable'
        ? 'Google sign-in is not available on this deployment. Use your email and password.'
        : null;

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
      <AuthForm mode="login" next={next} />
    </>
  );
}
