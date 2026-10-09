'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react';

/**
 * What a page shows when it fails.
 *
 * Until this existed there was no `error.tsx` anywhere in the application, so
 * a single slow query produced a bare platform failure with no explanation
 * and no way back - which reads as "the site is crashing" rather than "one
 * page timed out". That is the difference this is for, and it is mostly a
 * difference in what somebody does next.
 *
 * ## The digest is the point
 *
 * In production Next deliberately withholds a server error's message from the
 * browser, so it cannot leak a connection string or a query into a page.
 * `error.digest` is a hash of the real error and it appears in the server log
 * beside it - so printing it here is the one thing that turns "it broke" into
 * a line somebody can search for. Hiding it would be tidier and useless.
 *
 * ## `retry`, not `reset`
 *
 * This version of Next prefers `retry()`, which re-fetches and re-renders the
 * segment; `reset()` only clears the boundary without re-fetching, so for a
 * query that timed out it would redraw the same failure. The prop names
 * differ between versions, which is why this reads the bundled documentation
 * rather than memory.
 */
export function ErrorPanel({
  error,
  retry,
  title,
  body,
  home,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  body: string;
  home: { label: string; href: string };
}) {
  // The browser console gets the whole object, which in development still
  // carries the original message.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <span className="inline-flex rounded-full bg-coral-50 p-3 text-coral-700">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>

      <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">{body}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-700"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
        <Link
          href={home.href}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-muted-soft hover:bg-surface-sunken hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          {home.label}
        </Link>
      </div>

      {/*
        Shown rather than tucked away. It is not an apology, it is the handle:
        this exact string is in the server log next to the stack trace, so
        quoting it finds the cause in one search.
      */}
      {error.digest ? (
        <p className="mt-6 text-[11px] text-muted-soft">
          Reference <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-ink-soft">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
