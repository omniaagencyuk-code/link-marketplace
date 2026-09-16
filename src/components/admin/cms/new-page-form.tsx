'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPageAction } from '@/app/admin/(protected)/pages/actions';
import { checkSlug, slugify } from '@/lib/cms/custom-page';

/**
 * Creating a page.
 *
 * The URL is the only decision here that is expensive to change later, so it
 * gets the most attention: it is previewed live, validated as it is typed, and
 * defaults to a slug derived from the name. Everything else about the page is
 * edited afterwards, where there is room to do it properly.
 */
export function NewPageForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  // Until the URL is edited by hand it follows the name, which is what most
  // people want and nobody wants to type twice.
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');

  const effectiveSlug = slugTouched ? slugify(slug) : slugify(label);
  const slugState = effectiveSlug ? checkSlug(effectiveSlug) : { ok: false as const };

  function submit(formData: FormData) {
    setError(null);
    formData.set('slug', effectiveSlug);

    startTransition(async () => {
      const result = await createPageAction(formData);
      if (!result.ok || !result.slug) {
        setError(result.error ?? 'The page could not be created.');
        return;
      }
      // Straight into the editor - a new page is never the finished job.
      router.push(`/admin/pages/${result.slug}`);
    });
  }

  return (
    <form action={submit} className="max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Page details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="label">Page name</Label>
            <Input
              id="label"
              name="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Broken link building"
              maxLength={80}
              required
            />
            <p className="mt-1.5 text-[12px] text-muted">
              Shown in the admin and used as the breadcrumb on the page itself.
            </p>
          </div>

          <div>
            <Label htmlFor="slug">URL</Label>
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] text-muted">/</span>
              <Input
                id="slug"
                value={slugTouched ? slug : effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(event.target.value);
                }}
                placeholder="broken-link-building"
                maxLength={60}
              />
            </div>
            {effectiveSlug && !slugState.ok ? (
              <p className="mt-1.5 text-[12px] font-medium text-coral-700">{slugState.error}</p>
            ) : (
              <p className="mt-1.5 text-[12px] text-muted">
                Lower case letters, numbers and hyphens. This becomes the page&rsquo;s address and
                is awkward to change once people link to it, so it is worth getting right now.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="description">What is this page for?</Label>
            <Textarea
              id="description"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              maxLength={200}
              placeholder='Service page targeting "broken link building".'
            />
            <p className="mt-1.5 text-[12px] text-muted">
              A note for your team, shown on the pages list. Not published.
            </p>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <div
          role="alert"
          className="flex gap-2.5 rounded-lg border border-coral-300 bg-coral-50 p-3.5 text-[13px] text-coral-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="accent" size="lg" disabled={pending || !slugState.ok}>
          {pending ? 'Creating...' : 'Create page'}
        </Button>
        <p className="text-[13px] text-muted">
          Created as a draft. Nothing is public until you publish it.
        </p>
      </div>
    </form>
  );
}
