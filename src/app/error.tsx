'use client';

import { ErrorPanel } from '@/components/shared/error-panel';

/**
 * The catch-all, one level below `global-error.tsx`.
 *
 * The three boundaries beside it cover the areas somebody spends their time
 * in - the public site, the customer dashboard, the admin. This one covers
 * what is left: signing in, signing up, resetting a password, the admin
 * login, and the unsubscribe page a prospect reaches from an email. Without
 * it a failure in any of those skips every boundary and lands on
 * `global-error`, which replaces the root layout and arrives without the
 * stylesheet - a worse page than this one for a problem that is no worse.
 *
 * So `global-error.tsx` is left to mean what it says: the root layout itself
 * failed. Nothing else reaches it.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      title="This page didn't load"
      body="Something went wrong at our end rather than yours. Trying again usually works; if it doesn't, the reference below tells us exactly what failed."
      home={{ label: 'Back to the homepage', href: '/' }}
    />
  );
}
