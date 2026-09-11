'use client';

import { PageTitle } from './page-title';
import { useAuth } from '@/lib/providers/auth-provider';

/**
 * Greets whoever the client-side session says is signed in, so switching
 * between the mock customer and admin fixtures stays consistent with the
 * sidebar.
 */
export function WelcomeTitle({
  fallbackName,
  action,
}: {
  fallbackName: string;
  action?: React.ReactNode;
}) {
  const { user } = useAuth();
  const name = (user?.fullName ?? fallbackName).split(' ')[0];

  return (
    <PageTitle
      title={`Welcome back, ${name}`}
      description="Track live placements, pick up drafts and find your next set of websites."
      action={action}
    />
  );
}
