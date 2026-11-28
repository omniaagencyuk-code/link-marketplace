import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { safeReturnPath } from '@/lib/auth/return-to';
import { authMessage } from '@/lib/auth/messages';

export const metadata: Metadata = {
  title: 'Create a free account',
  description:
    'Create a free Press Parrot account to unlock the marketplace, save shortlists and order guest posts, niche edits and SEO content.',
  alternates: { canonical: '/signup' },
  robots: { index: false, follow: true },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  /*
    `?failed=` and `?notice=` are how /api/auth/sign-up answers a browser
    that cannot render the message itself - a submit with JavaScript off.
    Codes, never sentences: see `src/lib/auth/messages.ts`.
  */
  return (
    <AuthForm
      mode="signup"
      next={next}
      initial={{ error: authMessage(params.failed), notice: authMessage(params.notice) }}
    />
  );
}
