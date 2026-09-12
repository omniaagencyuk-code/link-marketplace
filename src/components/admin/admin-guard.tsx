'use client';

import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/providers/auth-provider';
import { brand } from '@/lib/config/brand';

/**
 * Development-only admin guard.
 *
 * Replace with a Supabase session check plus a row-level security policy on
 * `profiles.role` before this is exposed to real users.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, status, signInAsAdmin } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <p className="text-[13px] text-muted">Checking access...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-7 text-center shadow-[var(--shadow-card)]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-ink">Admin area</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            This area is restricted to {brand.name} staff. Authentication is mocked in this build,
            so you can unlock it locally for development.
          </p>
          <Button className="mt-5 w-full" onClick={() => signInAsAdmin()}>
            Continue as admin (development)
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
