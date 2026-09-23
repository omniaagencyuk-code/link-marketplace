'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldInput } from './field-input';
import { savePageContentAction, resetPageContentAction } from '@/app/admin/(protected)/pages/actions';
import { cn } from '@/lib/utils/cn';
import { formatDateTime } from '@/lib/utils/format';
import type { FieldValue, PageDef, PageValues } from '@/lib/cms/types';

/**
 * The page content editor.
 *
 * Holds the whole page as one value tree so saving, resetting and the
 * "unsaved changes" state are all decided in one place. Sections mirror the
 * visual sections of the live page, so an editor can find the copy they are
 * looking for by scrolling the page rather than hunting through a form.
 */
export function PageEditor({
  definition,
  defaults,
  saved,
  updatedAt,
  updatedBy,
}: {
  definition: PageDef;
  defaults: PageValues;
  /** Existing overrides, or an empty object for an untouched page. */
  saved: PageValues;
  /** When this page's copy was last saved, if it ever has been. */
  updatedAt?: string;
  updatedBy?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);

  // Start from defaults with overrides layered on, which is exactly what the
  // live page renders - so the form always opens showing the current site.
  const initial = useMemo(() => mergeForEditing(definition, defaults, saved), [
    definition,
    defaults,
    saved,
  ]);
  const [values, setValues] = useState<PageValues>(initial);
  const [activeSection, setActiveSection] = useState(definition.sections[0]?.key ?? '');

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const edited = Object.keys(saved).length > 0;
  const differsFromDefaults = JSON.stringify(values) !== JSON.stringify(
    mergeForEditing(definition, defaults, {}),
  );

  function setField(sectionKey: string, fieldKey: string, value: FieldValue) {
    setStatus(null);
    setValues((current) => ({
      ...current,
      [sectionKey]: { ...(current[sectionKey] ?? {}), [fieldKey]: value },
    }));
  }

  function save() {
    setStatus(null);
    startTransition(async () => {
      const result = await savePageContentAction(definition.slug, values);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? 'Could not save.' });
        return;
      }
      setStatus({ kind: 'ok', message: 'Saved. The live page is updated.' });
      router.refresh();
    });
  }

  function resetAll() {
    setStatus(null);
    startTransition(async () => {
      await resetPageContentAction(definition.slug);
      setValues(mergeForEditing(definition, defaults, {}));
      setStatus({ kind: 'ok', message: 'Reset to the original copy.' });
      router.refresh();
    });
  }

  return (
    <>
      {/* ------------------------------------------------- page summary --
          What an editor wants to know before they start typing: what this is,
          where it lives, whether anyone has touched it, and how to look at it.
          Deliberately a strip rather than a toolbar - the save control stays
          beside the sections, where the work is. */}
      <div className="mb-5 rounded-[var(--radius-card)] border border-line bg-white px-5 py-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold text-ink">{definition.label}</h2>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                  edited
                    ? 'bg-accent-50 text-accent-800'
                    : 'bg-surface-sunken text-muted',
                )}
              >
                {edited ? 'Edited' : 'Shipped copy'}
              </span>
            </div>
            <p className="mt-1 font-mono text-[12px] text-muted">{definition.path}</p>
          </div>

          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
            <div>
              <dt className="inline text-muted">Last updated </dt>
              <dd className="inline font-medium text-ink-soft">
                {updatedAt ? formatDateTime(updatedAt) : 'Never'}
              </dd>
            </div>
            {updatedBy ? (
              <div>
                <dt className="inline text-muted">By </dt>
                <dd className="inline font-medium text-ink-soft">{updatedBy}</dd>
              </div>
            ) : null}
            <div>
              <dt className="inline text-muted">Sections </dt>
              <dd className="inline font-medium text-ink-soft">{definition.sections.length}</dd>
            </div>
          </dl>
        </div>

        {definition.tokens?.length ? (
          /* The live figures this page can resolve. Listed here because a
             token only works where the page has the number to hand, and an
             editor cannot be expected to guess which ones those are. */
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[12px] font-medium text-ink-soft">
              Live values you can use in any text field
            </p>
            <ul className="mt-2 space-y-1">
              {definition.tokens.map((token) => (
                <li key={token.name} className="flex flex-wrap items-baseline gap-2 text-[12px]">
                  <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] text-ink">
                    {`{{${token.name}}}`}
                  </code>
                  <span className="text-muted">{token.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <nav aria-label="Page sections" className="lg:sticky lg:top-6 lg:self-start">
        <ul className="space-y-0.5">
          {definition.sections.map((section) => (
            <li key={section.key}>
              <button
                type="button"
                onClick={() => {
                  setActiveSection(section.key);
                  document
                    .getElementById(`section-${section.key}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cn(
                  'w-full rounded-md px-3 py-2 text-left text-[13px] font-medium transition-colors',
                  activeSection === section.key
                    ? 'bg-navy-900 text-white'
                    : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
                )}
              >
                {section.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 space-y-2 border-t border-line pt-4">
          <Button
            type="button"
            variant="accent"
            className="w-full"
            onClick={save}
            disabled={pending || !dirty}
          >
            <Save className="h-3.5 w-3.5" />
            {pending ? 'Saving...' : dirty ? 'Save changes' : 'Saved'}
          </Button>

          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href={definition.path} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              View live page
            </Link>
          </Button>

          {differsFromDefaults ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={resetAll}
              disabled={pending}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset whole page
            </Button>
          ) : null}
        </div>

        {status ? (
          <p
            role="status"
            className={cn(
              'mt-3 flex gap-2 rounded-lg border px-3 py-2 text-[12px] leading-snug',
              status.kind === 'ok'
                ? 'border-accent-500/30 bg-accent-50 text-accent-800'
                : 'border-negative/30 bg-negative/5 text-negative',
            )}
          >
            {status.kind === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {status.message}
          </p>
        ) : null}

        {dirty ? (
          <p className="mt-3 text-[12px] text-amber-700">
            Unsaved changes. Leaving this page loses them.
          </p>
        ) : null}
      </nav>

      <div className="min-w-0 space-y-5">
        {definition.sections.map((section) => (
          <Card key={section.key} id={`section-${section.key}`} className="scroll-mt-6">
            <CardHeader>
              <CardTitle>{section.label}</CardTitle>
              {section.description ? (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{section.description}</p>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-5">
              {section.fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[section.key]?.[field.key] ?? ''}
                  defaultValue={defaults[section.key]?.[field.key] ?? ''}
                  onChange={(value) => setField(section.key, field.key, value)}
                  idPrefix={`${definition.slug}-${section.key}`}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
    </>
  );
}

/**
 * Defaults with overrides layered on, for the form's initial state.
 *
 * Deliberately not the same as the render-time resolver: here an empty saved
 * string is kept as empty so the editor shows exactly what was saved, rather
 * than silently swapping the default back in while they are looking at it.
 */
function mergeForEditing(
  definition: PageDef,
  defaults: PageValues,
  overrides: PageValues,
): PageValues {
  const merged: PageValues = {};
  for (const section of definition.sections) {
    const sectionDefaults = defaults[section.key] ?? {};
    const sectionOverrides = overrides[section.key] ?? {};
    const values: Record<string, FieldValue> = {};

    for (const field of section.fields) {
      const override = sectionOverrides[field.key];
      const fallback =
        sectionDefaults[field.key] ??
        (field.type === 'list'
          ? []
          : field.type === 'link'
            ? { label: '', href: '/' }
            : field.type === 'image'
              ? { src: '', alt: '' }
              : '');
      values[field.key] = override !== undefined ? override : fallback;
    }
    merged[section.key] = values;
  }
  return merged;
}
