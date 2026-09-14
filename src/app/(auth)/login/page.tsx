import type { Metadata } from 'next';
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
  const next = safeNext((await searchParams).next);
  // Already signed in: no reason to show the form again.
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  return <AuthForm mode="login" next={next} />;
}
