'use client';

import { ErrorPanel } from '@/components/shared/error-panel';

/**
 * The admin area. Everything else, including the navigation, stays usable.
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
      body="The admin shell is fine - one page failed. The reference below is the hash Next logs beside the real stack trace, so searching the server logs for it finds the cause."
      home={{ label: 'Back to the dashboard', href: '/admin' }}
    />
  );
}
