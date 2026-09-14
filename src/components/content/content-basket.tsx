'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useContentDraft } from '@/lib/providers/content-draft-provider';
import { submitContentOrderAction } from '@/app/dashboard/content/actions';
import { contentTypeLabels, contentLanguageLabels } from '@/lib/config/content';
import { isPricingConfigured, priceForWords } from '@/lib/services/content-pricing';
import { formatPrice } from '@/lib/utils/format';
import type { ContentPricing } from '@/lib/types/content';

/**
 * The content basket and checkout.
 *
 * Prices here are indicative - `submitContentOrderAction` recomputes every
 * line from the same settings before writing the order.
 */
export function ContentBasket({ pricing }: { pricing: ContentPricing }) {
  const router = useRouter();
  const { items, update, remove, clear, count, totalWords, hydrated } = useContentDraft();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<string | null>(null);

  const configured = isPricingConfigured(pricing);
  const totalMinor = items.reduce((sum, item) => {
    const unit = priceForWords(pricing, item.brief.wordCount, item.brief.contentType);
    return sum + (unit ?? 0) * item.quantity;
  }, 0);
  const anyUnpriced = items.some(
    (item) => priceForWords(pricing, item.brief.wordCount, item.brief.contentType) === null,
  );

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await submitContentOrderAction(
        items.map((item) => ({ brief: item.brief, quantity: item.quantity })),
      );
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong. Try again.');
        return;
      }
      clear();
      setPlaced(result.reference ?? null);
      router.refresh();
    });
  }

  if (placed) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-accent-600" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-semibold text-ink">Content order placed</h2>
          <p className="mt-1.5 text-[14px] text-muted">
            Your reference is <span className="font-medium text-ink">{placed}</span>. We will
            confirm scope and pricing before writing begins.
          </p>
          <Button
            variant="accent"
            className="mt-5"
            onClick={() => router.push('/dashboard/content')}
          >
            View your content orders
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!hydrated) {
    return <div className="h-40 animate-pulse rounded-[var(--radius-card)] border border-line bg-white" />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No articles in this order yet"
        description="Fill in a brief and choose Add to Order. You can queue several articles before checking out."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>
          Your content order ({count} {count === 1 ? 'article' : 'articles'})
        </CardTitle>
        <button
          type="button"
          onClick={clear}
          className="text-[12px] text-muted hover:text-negative"
        >
          Clear all
        </button>
      </CardHeader>

      <CardContent className="divide-y divide-line p-0">
        {items.map((item) => {
          const unit = priceForWords(pricing, item.brief.wordCount, item.brief.contentType);
          return (
            <div key={item.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{item.brief.topic}</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  {contentTypeLabels[item.brief.contentType]} &middot;{' '}
                  {item.brief.wordCount.toLocaleString('en-GB')} words &middot;{' '}
                  {contentLanguageLabels[item.brief.language]} &middot; {item.brief.brand}
                </p>
                {item.brief.targetKeyword ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted">
                    Target keyword: {item.brief.targetKeyword}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <span className="sr-only sm:not-sr-only">Qty</span>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={item.quantity}
                    onChange={(event) =>
                      update(item.id, { quantity: Number(event.target.value) || 1 })
                    }
                    aria-label={`Quantity for ${item.brief.topic}`}
                    className="h-8 w-16 text-[13px]"
                  />
                </label>
                <span className="tabular w-24 text-right text-[14px] font-medium text-ink">
                  {unit === null ? 'On request' : formatPrice(unit * item.quantity)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.brief.topic}`}
                  onClick={() => remove(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <CardFooter className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">
              {count} {count === 1 ? 'article' : 'articles'} &middot;{' '}
              {totalWords.toLocaleString('en-GB')} words
            </p>
            <p className="text-[18px] font-semibold text-ink">
              {configured ? formatPrice(totalMinor) : 'Price on request'}
              {configured && anyUnpriced ? (
                <span className="ml-2 text-[12px] font-normal text-muted">
                  + items quoted separately
                </span>
              ) : null}
            </p>
          </div>

          <Button variant="accent" size="lg" onClick={checkout} disabled={pending}>
            {pending ? 'Placing order...' : 'Place content order'}
          </Button>
        </div>

        {!configured ? (
          <p className="text-[12px] text-muted">
            Content pricing has not been set yet, so this order will be quoted before any writing
            starts.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="flex gap-2 text-[13px] text-negative"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
