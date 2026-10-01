import { AlertTriangle } from 'lucide-react';

/**
 * A page in the admin that could not read what it needed.
 *
 * Next redacts the message of a server error in production and shows a grey
 * box reading "A server error occurred" - correct for a stranger, useless
 * for the person who can fix it. Working out that `section_drafts` had not
 * been created took writing a schema query and running it by hand, from a
 * screenshot of that box, with the real message sitting in a log nobody had
 * open.
 *
 * So the page catches its own failure and renders this instead. Everything
 * under `(protected)` has already established the viewer is an administrator,
 * so there is nobody here to withhold it from.
 *
 * It is not a way of carrying on regardless. The page is broken and says so;
 * what it adds is the sentence that says which thing to go and fix.
 */
export function AdminLoadError({ what, error }: { what: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);

  // The one failure worth naming, because it is a migration that did not run
  // rather than a bug, and because the Supabase SQL editor runs a selection
  // in preference to the whole tab - so "I ran it" and "it ran" come apart.
  const missingTable = /relation .* does not exist|could not find the table|schema cache/i.test(
    message,
  );

  return (
    <div className="rounded-[var(--radius-card)] border border-coral-200 bg-coral-50 px-4 py-4 text-[13px] text-coral-700">
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {what} could not be loaded.
      </p>

      <p className="mt-2 font-mono text-[12px] leading-relaxed break-words text-coral-800">
        {message}
      </p>

      {missingTable ? (
        <p className="mt-3 leading-relaxed">
          That reads like a migration that has not been applied. The files are in{' '}
          <code className="font-mono">supabase/migrations/</code>, and the{' '}
          <code className="font-mono">.paste.sql</code> copy of each one is the version for the SQL
          editor. They are written to be safe to run twice, so re-running the most recent one costs
          nothing. Check the editor is not running only a selection.
        </p>
      ) : null}
    </div>
  );
}
