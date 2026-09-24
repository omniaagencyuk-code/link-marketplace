'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Check, Clock, Info, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FavouriteButton } from '@/components/marketplace/favourite-button';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice, formatTurnaround } from '@/lib/utils/format';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { overridesForType, placementPrice, type BuyerTier } from '@/lib/utils/pricing';
import { linkTypeDescriptions, linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { Service, Website } from '@/lib/types';

/**
 * Service picker for a single website.
 *
 * Adding is deliberately one step: pick a service, add it. Target URL, anchor
 * text, landing page, notes and the optional article are collected once, on
 * the order page, so browsing and buying stay separate.
 */
export function OrderCard({
  website,
  tier = 'standard',
}: {
  website: Website;
  /** Read from the viewer's profile on the server, never from the browser. */
  tier?: BuyerTier;
}) {
  const available = website.services.filter((service) => service.available);
  const { add } = useOrderDraft();
  const [serviceId, setServiceId] = useState(available[0]?.id ?? '');
  const [added, setAdded] = useState(false);

  const selected = available.find((service) => service.id === serviceId) ?? available[0];
  const premiums = selected ? overridesForType(website.nichePrices, selected.type) : [];
  // What this buyer pays, which is not always the list price.
  const priced = selected ? placementPrice(website, selected.type, null, tier) : null;

  function addToOrder() {
    if (!selected) return;
    add({
      websiteId: website.id,
      websiteSlug: website.slug,
      websiteDomain: website.domain,
      serviceType: selected.type,
      priceMinor: priced?.priceMinor ?? selected.priceMinor,
      targetUrl: '',
      anchorText: '',
    });
    setAdded(true);
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
    <div className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
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
            onSelect={() => {
              setServiceId(service.id);
              setAdded(false);
            }}
          />
        ))}
      </fieldset>

      <div className="space-y-3 border-t border-line bg-surface/60 px-5 py-4">
        <div className="tabular flex items-center justify-between text-sm">
          <span className="text-muted">{linkTypeLabels[selected.type]}</span>
          <span className="font-semibold text-ink">
            {priced?.agencyRate ? (
              <span className="mr-1.5 text-[12px] font-normal text-muted line-through">
                {formatPrice(selected.priceMinor)}
              </span>
            ) : null}
            {formatPrice(priced?.priceMinor ?? selected.priceMinor)}
          </span>
        </div>
        {priced?.agencyRate ? (
          <p className="text-[12px] text-accent-700">Your agency rate.</p>
        ) : null}

        {/*
          The premiums for the placement being bought, and only that one:
          someone choosing a guest post is owed the guest post prices, not a
          rate card for things they are not buying. Shown before the button
          rather than after it, because the price of a gambling placement is
          something to know before adding it, not after.
        */}
        {premiums.length > 0 ? (
          <div className="border-t border-line pt-3">
            <p className="text-[12px] text-muted">Priced differently for some topics</p>
            <ul className="mt-1.5 space-y-1">
              {premiums.map((price) => (
                <li
                  key={price.niche}
                  className="tabular flex items-baseline justify-between gap-3 text-[13px]"
                >
                  <span className="text-ink-soft">{acceptedNicheLabel(price.niche)}</span>
                  <span className="font-semibold whitespace-nowrap text-ink">
                    {formatPrice(price.priceMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Button type="button" variant="accent" size="lg" className="w-full" onClick={addToOrder}>
          <ShoppingBag className="h-4 w-4" />
          Add to order
        </Button>

        {added ? (
          <div className="space-y-2">
            <p
              role="status"
              className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-accent-700"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Added to your order
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href="/dashboard/orders">
                Go to your order
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            You add your target URL, anchor text{premiums.length > 0 ? ', the topic' : ''} and any
            article on the order page. No payment is taken now.
          </p>
        )}
      </div>
    </div>
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
