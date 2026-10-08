'use client';

import { ErrorPanel } from '@/components/shared/error-panel';

/**
 * The customer dashboard. The sidebar and top bar are in the layout above, so they survive and the rest of the dashboard stays reachable.
 */
export default function SegmentError({
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
      body="Your orders and data are safe - this is a problem drawing the page, not with your account. Try again, and quote the reference below if it keeps happening."
      home={{ label: 'Back to the dashboard', href: '/dashboard' }}
    />
  );
}
