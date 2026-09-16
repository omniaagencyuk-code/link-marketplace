import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { getAdminSession, isAdminAuthConfigured } from '@/lib/auth/admin-access';
import { brand } from '@/lib/config/brand';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = {
  title: 'Admin sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Already signed in? Skip the form.
  if (await getAdminSession()) redirect('/admin');

  const { next } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo href={null} />
        </div>

        <div className="mt-8 rounded-[var(--radius-card)] border border-line bg-white p-7 shadow-[var(--shadow-card)]">
          <h1 className="text-lg font-semibold text-ink">Admin sign in</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            This area is restricted to the {brand.name} team.
          </p>

          <div className="mt-6">
            <AdminLoginForm next={next} sharedPasswordAvailable={isAdminAuthConfigured()} />
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted">
          Looking for your orders?{' '}
          <Link href="/dashboard" className="text-accent-700 hover:underline">
            Go to your dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
