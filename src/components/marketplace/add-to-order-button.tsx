'use client';

import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { linkTypeLabels } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';
import type { WebsiteListItem } from '@/lib/types';

/**
 * One-click add from a marketplace row.
 *
 * Adds the headline service - the one whose price the row displays - with the
 * placement details left blank. The buyer fills in target URL, anchor text and
 * the rest on the order page.
 */
export function AddToOrderButton({
  website,
  className,
  fullWidth = false,
}: {
  website: WebsiteListItem;
  className?: string;
  fullWidth?: boolean;
}) {
  const { add, has, hydrated } = useOrderDraft();
  const service = website.headlineService;
  const alreadyAdded = hydrated && has(website.id);

  if (!service) return null;

  const label = alreadyAdded ? 'In order' : 'Add';
  const description = alreadyAdded
    ? `${website.domain} is already in your order`
    : `Add a ${linkTypeLabels[service.type].toLowerCase()} on ${website.domain} to your order`;

  return (
    <Button
      size="sm"
      variant="outline"
      aria-label={description}
      title={description}
      disabled={alreadyAdded}
      className={cn(
        'disabled:opacity-100',
        alreadyAdded
          ? 'border-line text-muted'
          : 'border-accent-500/50 text-accent-700 hover:border-accent-500 hover:bg-accent-50',
        fullWidth && 'w-full',
        className,
      )}
      onClick={() =>
        add({
          websiteId: website.id,
          websiteSlug: website.slug,
          websiteDomain: website.domain,
          serviceType: service.type,
          priceMinor: service.priceMinor,
          targetUrl: '',
          anchorText: '',
        })
      }
    >
      {alreadyAdded ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}
