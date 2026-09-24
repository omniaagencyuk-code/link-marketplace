'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatPrice } from '@/lib/utils/format';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { linkTypeLabels } from '@/lib/utils/labels';
import type { PriceBreakdown } from '@/lib/pricing/engine';
import type { LinkTypeSlug } from '@/lib/types';

export interface MarginRow {
  websiteId: string;
  domain: string;
  linkType: string;
  niche: string;
  isOverride: boolean;
  currentMinor: number | null;
  breakdown: PriceBreakdown;
}

/**
 * Every price, and how it got there.
 *
 * Sorted thinnest margin first, because that is the only ordering anyone
 * opens this for. Each row expands into the full chain - publisher price,
 * conversion, fees, VAT, markup, rounding - so a price that looks wrong can
 * be argued with rather than just distrusted.
 */
export function MarginReport({
  rows,
  minMarginMinor,
}: {
  rows: MarginRow[];
  minMarginMinor: number;
}) {
  const [filter, setFilter] = useState('');
  const [show, setShow] = useState<'all' | 'thin' | 'overrides'>('all');
  const [openRow, setOpenRow] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows
      .filter((row) => (needle ? row.domain.toLowerCase().includes(needle) : true))
      .filter((row) =>
        show === 'thin'
          ? row.breakdown.marginMinor < minMarginMinor
          : show === 'overrides'
            ? row.isOverride
            : true,
      )
      .sort((a, b) => a.breakdown.marginMinor - b.breakdown.marginMinor);
  }, [rows, filter, show, minMarginMinor]);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-muted">
        Nothing priced yet. Costs come from the publisher inbox; once a listing has one, it is
        priced automatically.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filter}
          placeholder="Filter by domain"
          onChange={(event) => setFilter(event.target.value)}
          className="max-w-56"
        />
        <div className="w-44">
          <Select
            size="sm"
            value={show}
            aria-label="Which prices to show"
            onChange={(event) => setShow(event.target.value as typeof show)}
          >
            <option value="all">All prices</option>
            <option value="thin">Under the minimum</option>
            <option value="overrides">Set by hand</option>
          </Select>
        </div>
        <p className="tabular text-[12px] text-muted">{visible.length} shown</p>
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Sell prices and their margins</caption>
          <thead>
            <tr>
              <Th>Domain</Th>
              <Th>Placement</Th>
              <Th className="hidden md:table-cell">Topic</Th>
              <Th className="text-right">True cost</Th>
              <Th className="text-right">Sells at</Th>
              <Th className="text-right">Margin</Th>
              <Th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = `${row.websiteId}:${row.linkType}:${row.niche}`;
              const thin = row.breakdown.marginMinor < minMarginMinor;
              const open = openRow === key;

              return (
                <Tr key={key}>
                  <Td className="text-[13px] font-medium">
                    <Link
                      href={`/admin/websites/${row.websiteId}`}
                      className="text-ink hover:text-accent-700"
                    >
                      {row.domain}
                    </Link>
                    {row.isOverride ? (
                      <span
                        title="Set by hand. Recalculation leaves it alone."
                        className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-muted"
                      >
                        <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                        fixed
                      </span>
                    ) : null}
                    {open ? <Breakdown row={row} /> : null}
                  </Td>
                  <Td className="text-[13px] text-ink-soft">
                    {linkTypeLabels[row.linkType as LinkTypeSlug] ?? row.linkType}
                  </Td>
                  <Td className="hidden text-[13px] text-ink-soft md:table-cell">
                    {row.niche ? acceptedNicheLabel(row.niche) : 'General'}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink-soft">
                    {formatPrice(row.breakdown.trueCostMinor)}
                  </Td>
                  <Td className="tabular text-right text-[13px] font-semibold text-ink">
                    {formatPrice(row.isOverride && row.currentMinor != null ? row.currentMinor : row.breakdown.sellMinor)}
                  </Td>
                  <Td
                    className={`tabular text-right text-[13px] font-medium ${
                      thin ? 'text-negative' : 'text-ink'
                    }`}
                  >
                    {thin ? (
                      <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />
                    ) : null}
                    {formatPrice(row.breakdown.marginMinor)}
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      {row.breakdown.marginPct.toFixed(0)}%
                    </span>
                  </Td>
                  <Td className="text-right">
                    <button
                      type="button"
                      onClick={() => setOpenRow(open ? null : key)}
                      aria-expanded={open}
                      className="text-[12px] text-accent-700 hover:underline"
                    >
                      {open ? 'Hide' : 'Why'}
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}

/** The chain from what the publisher charges to what a buyer pays. */
function Breakdown({ row }: { row: MarginRow }) {
  const b = row.breakdown;
  const steps: [string, string][] = [
    [`Publisher price`, `${b.costMinor / 100} ${b.currency}`],
    [
      `Converted at ${b.fxRate.toFixed(4)} plus ${b.fxBufferPct}% buffer`,
      formatPrice(b.costGbpMinor),
    ],
    [`Payment fee (${b.feeLabel})`, formatPrice(b.feeMinor)],
    ...((b.vatMinor > 0 ? [[`Publisher VAT`, formatPrice(b.vatMinor)]] : []) as [string, string][]),
    [`True cost`, formatPrice(b.trueCostMinor)],
    [`Markup (${b.bandLabel})`, formatPrice(b.markupMinor)],
    [`Before rounding`, formatPrice(b.unroundedMinor)],
    [`Sells at`, formatPrice(b.sellMinor)],
    [`Agency price`, formatPrice(b.agencyMinor)],
  ];

  return (
    <dl className="mt-2 space-y-0.5 rounded-lg border border-line bg-surface-sunken p-2.5 text-[12px] font-normal">
      {steps.map(([label, value]) => (
        <div key={label} className="tabular flex justify-between gap-3">
          <dt className="text-muted">{label}</dt>
          <dd className="text-ink">{value}</dd>
        </div>
      ))}
      {row.isOverride && row.currentMinor != null ? (
        <p className="mt-1.5 border-t border-line pt-1.5 text-[11px] leading-snug text-negative">
          Set by hand to {formatPrice(row.currentMinor)}. The engine would say{' '}
          {formatPrice(b.sellMinor)}; the figures above are what it would have done.
        </p>
      ) : null}
    </dl>
  );
}
