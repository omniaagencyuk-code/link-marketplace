'use client';

import { useState, useTransition } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fillDescriptionsAction } from '@/app/admin/(protected)/refresh/description-actions';

/**
 * Fill in what each publisher says their own site is about.
 *
 * Separate from the Ahrefs controls above it, and deliberately plain about why:
 * that job spends credits on every run and this one spends nothing, so the two
 * should not look like the same button with a different label.
 *
 * A run is bounded so it finishes inside a serverless invocation. Pressing it
 * again continues, because the job asks for listings that are still blank
 * rather than counting from an offset.
 */
export function FillDescriptions({ blank }: { blank: number }) {
  const [busy, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
              <FileText className="h-4 w-4 text-accent-600" aria-hidden="true" />
              Site descriptions
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-muted">
              Reads each publisher&rsquo;s homepage and stores the description they wrote
              themselves. It fills the listing overview, the marketplace card and the table row.
              Costs nothing - no Ahrefs credits and no API spend.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={busy || blank === 0}
            onClick={() =>
              startTransition(async () => {
                setResult(await fillDescriptionsAction());
              })
            }
          >
            {busy ? 'Reading homepages…' : 'Fill descriptions'}
          </Button>
        </div>

        <p className="text-[13px] text-ink-soft">
          {blank === 0
            ? 'Every listing has a description.'
            : `${blank} ${blank === 1 ? 'listing has' : 'listings have'} no description yet.`}
        </p>

        {result ? (
          <p
            className={`rounded-lg border px-3 py-2 text-[13px] ${
              result.ok
                ? 'border-line bg-surface-sunken text-ink-soft'
                : 'border-coral-300 bg-coral-50 text-coral-700'
            }`}
          >
            {result.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
