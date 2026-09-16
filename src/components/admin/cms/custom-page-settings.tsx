'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, ExternalLink, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  deletePageAction,
  updatePageSettingsAction,
} from '@/app/admin/(protected)/pages/actions';

/**
 * The name, URL, published state and delete control for a page created here.
 *
 * Separate from the content editor because these are different kinds of
 * decision: the editor changes what the page says, this changes whether it
 * exists and whether anyone can see it. Deleting asks twice, because unlike
 * every other action in the editor it cannot be undone.
 */
export function CustomPageSettings({
  slug,
  label,
  description,
  published,
}: {
  slug: string;
  label: string;
  description: string;
  published: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleting] = useTransition();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function save(formData: FormData) {
    setStatus(null);
    startTransition(async () => {
      const result = await updatePageSettingsAction(slug, formData);
      setStatus(
        result.ok
          ? { kind: 'ok', message: 'Saved.' }
          : { kind: 'error', message: result.error ?? 'Could not save.' },
      );
      if (result.ok) router.refresh();
    });
  }

  function remove() {
    startDeleting(async () => {
      const result = await deletePageAction(slug);
      if (result.ok) {
        router.push('/admin/pages');
        return;
      }
      setStatus({ kind: 'error', message: result.error ?? 'Could not delete the page.' });
      setConfirmingDelete(false);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Page settings</CardTitle>
        {published ? (
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            View live page
          </a>
        ) : null}
      </CardHeader>

      <CardContent>
        <form action={save} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Label htmlFor="label">Page name</Label>
              <Input id="label" name="label" defaultValue={label} maxLength={80} required />
            </div>

            <div>
              <Label htmlFor="page-url">URL</Label>
              <Input id="page-url" value={`/${slug}`} readOnly disabled />
              <p className="mt-1.5 text-[12px] text-muted">
                Fixed once created. To move the page, create a new one and delete this.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="description">What is this page for?</Label>
            <Textarea id="description" name="description" defaultValue={description} rows={2} maxLength={200} />
            <p className="mt-1.5 text-[12px] text-muted">
              A note for your team, shown on the pages list. Not published.
            </p>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <label htmlFor="published" className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
              <Checkbox id="published" name="published" defaultChecked={published} />
              Published
            </label>
            <p className="mt-1.5 pl-6.5 text-[12px] text-muted">
              While unpublished the page returns a 404 to visitors and stays out of the sitemap.
              You can still edit and preview it here.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving...' : 'Save settings'}
            </Button>

            {status ? (
              <span
                role="status"
                className={
                  status.kind === 'ok'
                    ? 'inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700'
                    : 'inline-flex items-center gap-1.5 text-[13px] font-medium text-coral-700'
                }
              >
                {status.kind === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                )}
                {status.message}
              </span>
            ) : null}
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-5">
          {confirmingDelete ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[13px] font-medium text-ink">
                Delete this page and everything written on it? This cannot be undone.
              </p>
              <Button type="button" variant="danger" onClick={remove} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Yes, delete it'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(true)}
              className="text-coral-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete page
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
