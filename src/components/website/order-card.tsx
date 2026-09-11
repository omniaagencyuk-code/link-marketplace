'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, Clock, Info, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FavouriteButton } from '@/components/marketplace/favourite-button';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice, formatTurnaround } from '@/lib/utils/format';
import { linkTypeDescriptions, linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { Service, Website } from '@/lib/types';

/**
 * Order builder for a single website.
 *
 * No payment is taken - the item is added to a local draft order. Swap
 * `add()` for a Supabase insert plus a Stripe checkout session later.
 */
export function OrderCard({ website }: { website: Website }) {
  const available = website.services.filter((service) => service.available);
  const { add } = useOrderDraft();
  const [serviceId, setServiceId] = useState(available[0]?.id ?? '');
  const [targetUrl, setTargetUrl] = useState('');
  const [anchorText, setAnchorText] = useState('');
  const [landingPage, setLandingPage] = useState('');
  const [notes, setNotes] = useState('');
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = available.find((service) => service.id === serviceId) ?? available[0];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!targetUrl.trim()) {
      setError('Add the URL you want the link to point to.');
      return;
    }
    setError(null);
    add({
      websiteId: website.id,
      websiteSlug: website.slug,
      websiteDomain: website.domain,
      serviceType: selected.type,
      priceMinor: selected.priceMinor,
      targetUrl: targetUrl.trim(),
      anchorText: anchorText.trim(),
      preferredLandingPage: landingPage.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setAdded(true);
    setTargetUrl('');
    setAnchorText('');
    setLandingPage('');
    setNotes('');
  }

  if (!selected) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-semibold text-ink">Not accepting orders</p>
        <p className="mt-1.5 text-[13px] text-muted">
          This publisher has paused new placements. Browse similar websites in the same niche.
        </p>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link href={`/websites?niche=${website.niche}`}>See similar websites</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]"
    >
      <div className="border-b border-line px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-muted">Starting from</p>
            <p className="tabular text-2xl font-semibold text-ink">
              {formatPrice(Math.min(...available.map((service) => service.priceMinor)))}
            </p>
          </div>
          <FavouriteButton websiteId={website.id} domain={website.domain} size="md" />
        </div>
      </div>

      <fieldset className="space-y-2 px-5 py-4">
        <legend className="mb-2 text-[13px] font-semibold text-ink">Choose a service</legend>
        {available.map((service) => (
          <ServiceOption
            key={service.id}
            service={service}
            checked={service.id === selected.id}
            onSelect={() => setServiceId(service.id)}
          />
        ))}
      </fieldset>

      <div className="space-y-3.5 border-t border-line px-5 py-4">
        <div>
          <Label htmlFor="target-url">Target URL</Label>
          <Input
            id="target-url"
            type="url"
            required
            value={targetUrl}
            onChange={(event) => setTargetUrl(event.target.value)}
            placeholder="https://yourdomain.com/page"
            className="mt-1.5"
            aria-describedby={error ? 'target-url-error' : undefined}
          />
          {error ? (
            <p id="target-url-error" role="alert" className="mt-1 text-[12px] text-negative">
              {error}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="anchor-text">Anchor text</Label>
          <Input
            id="anchor-text"
            value={anchorText}
            onChange={(event) => setAnchorText(event.target.value)}
            placeholder="e.g. best casino bonuses"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="landing-page">Preferred landing page on this site</Label>
          <Input
            id="landing-page"
            value={landingPage}
            onChange={(event) => setLandingPage(event.target.value)}
            placeholder="Optional, for niche edits"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="order-notes">Notes for the publisher</Label>
          <Textarea
            id="order-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Angle, brief, tone of voice or anything to avoid."
            className="mt-1.5 min-h-20"
          />
        </div>
      </div>

      <div className="space-y-3 border-t border-line bg-surface/60 px-5 py-4">
        <div className="tabular flex items-center justify-between text-sm">
          <span className="text-muted">{linkTypeLabels[selected.type]}</span>
          <span className="font-semibold text-ink">{formatPrice(selected.priceMinor)}</span>
        </div>
        <Button type="submit" variant="accent" size="lg" className="w-full">
          <ShoppingBag className="h-4 w-4" />
          Add to order
        </Button>
        {added ? (
          <p
            role="status"
            className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-accent-700"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Added to your order.{' '}
            <Link href="/dashboard/orders" className="underline underline-offset-2">
              View order
            </Link>
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            No payment is taken now. You can review everything before submitting the order.
          </p>
        )}
      </div>
    </form>
  );
}

function ServiceOption({
  service,
  checked,
  onSelect,
}: {
  service: Service;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
        checked
          ? 'border-accent-500 bg-accent-50/50 ring-1 ring-accent-500/30'
          : 'border-line hover:border-muted-soft',
      )}
    >
      <input
        type="radio"
        name="service"
        checked={checked}
        onChange={onSelect}
        className="mt-1 h-3.5 w-3.5 accent-[var(--color-accent-600)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-ink">{linkTypeLabels[service.type]}</span>
          <span className="tabular text-[13px] font-semibold text-ink">
            {formatPrice(service.priceMinor)}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-1 text-[12px] text-muted">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatTurnaround(service.turnaroundMinDays, service.turnaroundMaxDays)} turnaround
        </span>
        <span className="mt-1 block text-[12px] leading-relaxed text-muted">
          {linkTypeDescriptions[service.type]}
        </span>
      </span>
    </label>
  );
}
