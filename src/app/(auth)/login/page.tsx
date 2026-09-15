import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import { getCurrentUser } from '@/lib/auth/customer-access';

export const metadata: Metadata = {
  title: 'Log in',
  description: 'Log in to your Press Parrot account to manage orders, saved websites and billing.',
  alternates: { canonical: '/login' },
  robots: { index: false, follow: true },
};

/** Only same-origin paths, so a crafted `next` cannot bounce a user offsite. */
function safeNext(value: string | string[] | undefined) {
  const path = typeof value === 'string' ? value : '';
  return path.startsWith('/') && !path.startsWith('//') ? path : undefined;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  // Already signed in: no reason to show the form again.
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  // Sent here by /auth/confirm when a one-time link has expired or been used.
  const expired = params.error === 'link-expired';

  return (
    <>
      {expired ? (
        <p
          role="alert"
          className="mb-5 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          That link has expired or has already been used. Log in, or request a new one.
        </p>
      ) : null}
      <AuthForm mode="login" next={next} />
    </>
  );
}
