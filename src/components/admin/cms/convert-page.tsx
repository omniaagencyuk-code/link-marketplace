'use client';

import { useActionState } from 'react';
import { ArrowRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { convertPageToSectionsAction } from '@/app/admin/(protected)/pages/section-actions';

/**
 * Moving a page onto the page builder.
 *
 * The offer is deliberately not automatic. Converting reads the page's
 * current content and writes one section per band, and until somebody has
 * looked at the result beside the live page nobody knows it is right - so it
 * is a button an administrator presses, once, when they are ready to check.
 *
 * It adds rows and removes nothing. Deleting the sections puts the page back.
 */
export function ConvertPage({ pageSlug, template }: { pageSlug: string; template: string }) {
  const [state, action, pending] = useActionState(convertPageToSectionsAction, {});

  return (
    <form action={action} className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-5">
      <input type="hidden" name="pageSlug" value={pageSlug} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink">
            <Layers className="h-4 w-4 text-accent-600" aria-hidden="true" />
            This page still renders from its template
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Converting turns each band of the live page into a section you can reorder, hide or
            add to. The copy comes across exactly as it is, live figures stay live, and nothing is
            deleted - the page keeps rendering from the template until the sections exist, and
            deleting them puts it back.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Check the live page against the sections afterwards. They should look identical.
          </p>
        </div>

        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? 'Converting...' : 'Convert to sections'}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {state.error ? (
        <p role="status" className="mt-3 text-[12px] text-negative">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="mt-3 text-[12px] text-accent-800">
          {state.message}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] text-muted">Template: {template}</p>
    </form>
  );
}
