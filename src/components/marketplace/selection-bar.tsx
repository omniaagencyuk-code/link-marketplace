'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavourites } from '@/lib/providers/favourites-provider';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice } from '@/lib/utils/format';
import type { WebsiteListItem } from '@/lib/types';

/** Bulk actions for rows selected in the marketplace table. */
export function SelectionBar({
  count,
  onClear,
  websites,
}: {
  count: number;
  onClear: () => void;
  websites: WebsiteListItem[];
}) {
  const { toggle } = useFavourites();
  const { add } = useOrderDraft();

  const total = websites.reduce((sum, website) => sum + website.headlinePriceMinor, 0);

  function addAllToOrder() {
    for (const website of websites) {
      const service = website.headlineService;
      if (!service) continue;
      add({
        websiteId: website.id,
        websiteSlug: website.slug,
        websiteDomain: website.domain,
        serviceType: service.type,
        priceMinor: service.priceMinor,
        targetUrl: '',
        anchorText: '',
      });
    }
    onClear();
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-navy-900/15 bg-navy-900 px-4 py-3 text-white">
      <p className="text-[13px]">
        <span className="font-semibold">{count}</span> selected
        <span className="tabular ml-2 text-white/60">
          {formatPrice(total)} estimated total
        </span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => {
            websites.forEach((website) => toggle(website.id));
            onClear();
          }}
        >
          Save all
        </Button>
        <Button size="sm" variant="accent" onClick={addAllToOrder}>
          Add to order
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClear}
          aria-label="Clear selection"
          className="text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
