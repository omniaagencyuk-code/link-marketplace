'use client';

import { ErrorPanel } from '@/components/shared/error-panel';

/**
 * The public site. The marketing layout above this still renders, so the header and footer stay and somebody always has a way onward.
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
      body="Something went wrong at our end rather than yours. Trying again usually works; if it doesn't, the reference below tells us exactly what failed."
      home={{ label: 'Back to the marketplace', href: '/marketplace' }}
    />
  );
}
