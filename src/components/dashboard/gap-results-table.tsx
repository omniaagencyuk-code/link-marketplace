'use client';

import { Fragment, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { WebsiteSnippet } from '@/components/marketplace/website-snippet';
import { cn } from '@/lib/utils/cn';
import type { WebsiteListItem } from '@/lib/types';

/**
 * The gaps we can sell, each one openable.
 *
 * The same panel the marketplace uses, on the page where the intent actually
 * is. Before this the row offered a link to `/websites?q=<domain>` - a search
 * results page - so deciding whether one of thirty-five sites was worth buying
 * meant leaving the report, finding the row again, opening it there, and
 * losing your place in the list you were working through.
 *
 * ## Why this does not make the page slow
 *
 * `WebsiteSnippet` fetches nothing. Expanding a row is pure rendering off data
 * the client already holds, which is a rule its own header states and the
 * reason the marketplace can show fifty of them. Adding it here costs one
 * extra query on the server, for the sellable rows only - far less than the
 * marketplace's own page, which reads every active listing with every join.
 *
 * The rows that are not ours are a different table and deliberately have no
 * panel: we hold nothing to put in one. Buying metrics for domains we cannot
 * sell is the single most expensive thing this feature could do.
 */
export interface GapSellableRow {
  domain: string;
  linkingCompetitors: string[];
  domainRating?: number;
  organicTraffic?: number;
  /** Absent when the listing went inactive between the run and this read. */
  website?: WebsiteListItem;
}

/**
 * Clicks that belong to something else.
 *
 * Copied from the marketplace table, and needed for the same reason: the row
 * toggles the panel, and the panel contains links and an Add to order button.
 * A click that started inside one of those is that control's click. Without
 * this, ordering a site collapses the row you ordered it from.
 */
function isOwnClick(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, label') !== null;
}

export function GapResultsTable({ rows }: { rows: GapSellableRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <TableWrap>
      <Table>
        <thead>
          <Tr>
            <Th>Site</Th>
            <Th className="text-right">DR</Th>
            <Th className="text-right">Traffic</Th>
            <Th>Links to</Th>
            <Th />
          </Tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded === row.domain;
            const panelId = `gap-${row.domain.replace(/[^a-z0-9]/gi, '-')}`;

            return (
              <Fragment key={row.domain}>
                <Tr
                  className={cn(row.website && 'cursor-pointer')}
                  onClick={(event) => {
                    if (!row.website) return;
                    if (isOwnClick(event.target)) return;
                    setExpanded(open ? null : row.domain);
                  }}
                >
                  <Td className="font-medium text-ink">{row.domain}</Td>
                  <Td className="tabular text-right">{row.domainRating ?? '—'}</Td>
                  <Td className="tabular text-right">
                    {row.organicTraffic ? row.organicTraffic.toLocaleString('en-GB') : '—'}
                  </Td>
                  <Td className="text-[12px] text-muted">{row.linkingCompetitors.join(', ')}</Td>
                  <Td className="text-right">
                    {row.website ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-controls={panelId}
                        onClick={() => setExpanded(open ? null : row.domain)}
                        className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-700 hover:underline"
                      >
                        {open ? 'Close' : 'Details'}
                        <ChevronDown
                          className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
                          aria-hidden="true"
                        />
                      </button>
                    ) : (
                      /*
                        No listing came back for this row, so there is nothing
                        to open and nothing to order. It stays in the table
                        because it is still a real gap - the competitor really
                        does have that link - and quietly dropping it would
                        make the count disagree with the rows.
                      */
                      <span className="text-[12px] text-muted">Not available</span>
                    )}
                  </Td>
                </Tr>

                {/* Its own row rather than an overlay, so the table keeps
                    doing the layout and nothing below it moves. */}
                {open && row.website ? (
                  <tr className="border-b border-line bg-surface/60 last:border-b-0">
                    <td colSpan={5} className="px-4 py-4">
                      <WebsiteSnippet id={panelId} website={row.website} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
    </TableWrap>
  );
}
