'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { checkSlug, slugify } from '@/lib/cms/custom-page';
import { duplicatePageAction } from '@/app/admin/(protected)/pages/actions';

/**
 * Copy a page into a new one.
 *
 * The case this exists for is turning /gambling-link-building into a sports
 * version: everything about that page is right except the words, and building
 * it again from an empty page means rewriting eight sections to say the same
 * things about a different subject.
 *
 * What it says it will not copy is as important as what it copies. An editor
 * who does not know that the SEO description and the marketplace category are
 * cleared will publish a page that tells Google it is a duplicate of the
 * original and shows the original's publishers - so the form says so before
 * they press the button, rather than the release notes saying so afterwards.
 */
export function DuplicatePage({ from, label }: { from: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${label} copy`);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const effectiveSlug = slugTouched ? slugify(slug) : slugify(name);
  const slugState = effectiveSlug ? checkSlug(effectiveSlug) : { ok: false as const };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData();
    form.set('from', from);
    form.set('label', name);
    form.set('slug', effectiveSlug);

    const result = await duplicatePageAction(form);
    setPending(false);

    if (!result.ok || !result.slug) {
      setError(result.error ?? 'That did not work.');
      return;
    }
    router.push(`/admin/pages/${result.slug}`);
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        Duplicate
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 w-full rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <p className="text-[13px] font-medium text-ink">Duplicate “{label}”</p>

      <div className="mt-3 space-y-3">
        <div>
          <Label htmlFor={`dup-name-${from}`}>Page name</Label>
          <Input
            id={`dup-name-${from}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`dup-slug-${from}`}>URL</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="shrink-0 font-mono text-[12px] text-muted">/</span>
            <Input
              id={`dup-slug-${from}`}
              value={slugTouched ? slug : effectiveSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              className="font-mono text-[13px]"
            />
          </div>
          {effectiveSlug && !slugState.ok ? (
            <p className="mt-1.5 text-[12px] font-medium text-coral-700">{slugState.error}</p>
          ) : null}
        </div>
      </div>

      {/*
        Said before the button, not after. An editor who does not know these
        are cleared publishes a page that tells Google it is a copy of the
        original and shows the original's publishers.
      */}
      <ul className="mt-4 space-y-1 text-[12px] text-muted">
        <li>Copies the sections, their layouts, animations and content.</li>
        <li>Does not copy the search engine listing — write a new one.</li>
        <li>Does not copy the marketplace category — choose the right one.</li>
        <li>Starts as a draft, so nothing is live until you publish it.</li>
      </ul>

      {error ? <p className="mt-3 text-[13px] text-negative">{error}</p> : null}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="accent" size="sm" disabled={pending || !slugState.ok}>
          {pending ? 'Copying…' : 'Create the copy'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
