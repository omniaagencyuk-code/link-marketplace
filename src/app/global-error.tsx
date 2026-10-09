'use client';

/**
 * The last resort: the root layout itself failed.
 *
 * `error.tsx` wraps a segment's pages but not the layout above it, so a
 * failure in the root layout escapes all three of them. This catches that.
 *
 * ## Why it is styled by hand
 *
 * The bundled documentation is explicit: `global-error` replaces the root
 * layout when it renders, provides its own `<html>` and `<body>`, and does
 * **not** include the application's global stylesheet. So Tailwind classes
 * would do nothing here and the page would arrive as unstyled black text on
 * white - which is precisely the "the site is broken" impression this whole
 * change exists to remove. Inline styles are the only ones that reach it.
 *
 * `<title>` is set as a React element because metadata exports are not
 * supported in a client component, which is what an error boundary must be.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f7f9fb',
          color: '#0b1b2b',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <title>Something went wrong | Press Parrot</title>

        <main style={{ maxWidth: '32rem', padding: '2rem', textAlign: 'center' }}>
          {/* The parrot, drawn inline: an <img> here would be a request that
              may be failing for the same reason the page is. */}
          <svg viewBox="0 0 32 32" width="48" height="48" role="presentation" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="#0b1b2b" />
            <path d="M15 11.2c1-3.6 3.9-5.9 7.1-5.8-.1 3.4-2.2 6.2-5.2 7.3z" fill="#6ee7b7" />
            <circle cx="18.2" cy="16.4" r="6.8" fill="#34d399" />
            <path
              d="M12.6 13.2 6.9 15.8c-.9.4-.9 1.7 0 2.1l4.3 2c.7.3 1.4-.3 1.2-1l-.5-2a1.4 1.4 0 0 1 .1-.9l.8-1.8c.3-.6-.4-1.2-1-.9Z"
              fill="#f4633a"
            />
            <circle cx="19.8" cy="14.9" r="1.8" fill="#0b1b2b" />
            <circle cx="20.4" cy="14.3" r=".55" fill="#ffffff" />
          </svg>

          <h1 style={{ margin: '1rem 0 0', fontSize: '1.4rem', letterSpacing: '-0.01em' }}>
            Something went wrong
          </h1>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', lineHeight: 1.6, color: '#64748b' }}>
            Press Parrot could not draw this page. Nothing you have ordered is affected.
          </p>

          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => retry()}
              style={{
                border: 0,
                cursor: 'pointer',
                borderRadius: '0.5rem',
                padding: '0.65rem 1.1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#ffffff',
                background: '#059669',
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                A plain anchor on purpose. This file replaces the root layout
                when it renders, so the router and the layout the <Link /> would
                soft-navigate inside are part of what has already failed. A full
                document load is the only navigation that is certain to work,
                and it is the one thing a reader in this state wants. */}
            <a
              href="/"
              style={{
                borderRadius: '0.5rem',
                padding: '0.65rem 1.1rem',
                fontSize: '0.85rem',
                fontWeight: 500,
                color: '#3d4f61',
                textDecoration: 'none',
                border: '1px solid #e4e9ef',
                background: '#ffffff',
              }}
            >
              Back to the homepage
            </a>
          </div>

          {error.digest ? (
            <p style={{ marginTop: '1.5rem', fontSize: '0.7rem', color: '#8595a6' }}>
              Reference{' '}
              <code style={{ background: '#eef2f6', padding: '0.15rem 0.4rem', borderRadius: '0.25rem' }}>
                {error.digest}
              </code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
