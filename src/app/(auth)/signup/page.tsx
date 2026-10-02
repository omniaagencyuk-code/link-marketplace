import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import { getCurrentUser } from '@/lib/auth/customer-access';
import { safeReturnPath } from '@/lib/auth/return-to';

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
  const next = safeReturnPath((await searchParams).next);
  if (await getCurrentUser()) redirect(next ?? '/dashboard');

  return <AuthForm mode="signup" next={next} />;
}
