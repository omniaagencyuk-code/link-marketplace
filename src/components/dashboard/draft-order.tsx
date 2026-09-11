'use client';

import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { useOrderDraft } from '@/lib/providers/order-draft-provider';
import { formatPrice } from '@/lib/utils/format';
import { linkTypeLabels } from '@/lib/utils/labels';

/**
 * The current basket. Submitting is a no-op placeholder: checkout and payment
 * arrive with the Supabase and Stripe integration.
 */
export function DraftOrder() {
  const { items, remove, clear, totalMinor, hydrated } = useOrderDraft();

  if (!hydrated || items.length === 0) return null;

  return (
    <section aria-labelledby="draft-order">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="draft-order" className="text-[15px] font-semibold text-ink">
          Current order draft
          <span className="ml-2 text-[13px] font-normal text-muted">
            ({items.length} {items.length === 1 ? 'item' : 'items'})
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={clear}>
          Clear draft
        </Button>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Items in your current order draft</caption>
          <thead>
            <tr>
              <Th>Website</Th>
              <Th className="hidden sm:table-cell">Service</Th>
              <Th className="hidden md:table-cell">Target URL</Th>
              <Th className="hidden lg:table-cell">Anchor text</Th>
              <Th className="text-right">Price</Th>
              <Th className="w-10">
                <span className="sr-only">Remove</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <Tr key={item.id}>
                <Td>
                  <Link
                    href={`/websites/${item.websiteSlug}`}
                    className="text-[13px] font-medium text-ink hover:text-accent-700"
                  >
                    {item.websiteDomain}
                  </Link>
                </Td>
                <Td className="hidden text-[13px] text-ink-soft sm:table-cell">
                  {linkTypeLabels[item.serviceType]}
                </Td>
                <Td className="hidden max-w-56 truncate text-[13px] text-muted md:table-cell">
                  {item.targetUrl || 'Not set'}
                </Td>
                <Td className="hidden max-w-40 truncate text-[13px] text-muted lg:table-cell">
                  {item.anchorText || '—'}
                </Td>
                <Td className="tabular text-right text-[13px] font-semibold text-ink">
                  {formatPrice(item.priceMinor)}
                </Td>
                <Td>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${item.websiteDomain} from draft`}
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-white px-4 py-3 shadow-[var(--shadow-card)]">
        <p className="tabular text-[14px] text-ink-soft">
          Draft total <span className="ml-1 font-semibold text-ink">{formatPrice(totalMinor)}</span>
          <span className="ml-2 text-[12px] text-muted">excluding VAT</span>
        </p>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/websites">Add more websites</Link>
          </Button>
          <Button variant="accent" size="sm" disabled title="Checkout ships with payments">
            Submit order
          </Button>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Checkout is disabled in this build. Orders are submitted once payments are connected.
      </p>
    </section>
  );
}
