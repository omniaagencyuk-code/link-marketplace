'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Copy, Pencil, RefreshCw, Search } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { nicheName } from '@/lib/data/categories';
import { formatCompactNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PreparedRow, RowStatus } from '@/lib/import/types';

const statusMeta: Record<RowStatus, { label: string; tone: BadgeTone; icon: typeof Check }> = {
  ready: { label: 'Ready', tone: 'positive', icon: Check },
  warning: { label: 'Warning', tone: 'warning', icon: AlertTriangle },
  error: { label: 'Error', tone: 'negative', icon: AlertCircle },
  existing: { label: 'Existing', tone: 'info', icon: RefreshCw },
  duplicate: { label: 'Duplicate', tone: 'neutral', icon: Copy },
};

type Filter = 'all' | RowStatus;

/** Step 3: review every row, deselect anything that should not import. */
export function ImportPreviewTable({
  rows,
  onToggleRow,
  onToggleFiltered,
  onEditRow,
  currencySymbol,
}: {
  rows: PreparedRow[];
  onToggleRow: (rowNumber: number) => void;
  onToggleFiltered: (rowNumbers: number[], selected: boolean) => void;
  onEditRow: (rowNumber: number, header: string, value: string) => void;
  currencySymbol: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [term, setTerm] = useState('');
  const [editing, setEditing] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (!needle) return true;
      return `${row.domain} ${row.values.website_name ?? ''}`.toLowerCase().includes(needle);
    });
  }, [rows, filter, term]);

  // Only the first 200 matching rows are rendered; a 5,000 row table would
  // make the page unusable and nobody reads that far anyway.
  const visible = filtered.slice(0, 200);
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => row.selected);

  const counts: Record<Filter, number> = {
    all: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    existing: rows.filter((row) => row.status === 'existing').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length,
    error: rows.filter((row) => row.status === 'error').length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <label htmlFor="import-search" className="sr-only">
            Search rows
          </label>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            id="import-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search domains"
            className="h-9 pl-9 text-[13px]"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(['all', 'ready', 'warning', 'existing', 'duplicate', 'error'] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                'rounded-full border px-3 py-1 text-[12px] font-medium capitalize transition-colors',
                filter === key
                  ? 'border-navy-900 bg-navy-900 text-white'
                  : 'border-line-strong bg-white text-ink-soft hover:border-muted-soft',
              )}
            >
              {key === 'all' ? 'All' : statusMeta[key].label}
              <span className="tabular ml-1.5 opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span>
          Showing {visible.length.toLocaleString('en-GB')} of{' '}
          {filtered.length.toLocaleString('en-GB')} matching rows
          {filtered.length > visible.length ? ' (first 200)' : ''}
        </span>
        {filtered.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onToggleFiltered(
                filtered.map((row) => row.rowNumber),
                !allFilteredSelected,
              )
            }
          >
            {allFilteredSelected ? 'Deselect these rows' : 'Select these rows'}
          </Button>
        ) : null}
      </div>

      <TableWrap>
        <Table>
          <caption className="sr-only">Rows detected in the uploaded CSV</caption>
          <thead>
            <tr>
              <Th className="w-10 pr-0">
                <span className="sr-only">Include</span>
              </Th>
              <Th className="w-12">Row</Th>
              <Th className="w-24">Status</Th>
              <Th className="min-w-52">Domain</Th>
              <Th className="w-24">Niche</Th>
              <Th className="w-16">Country</Th>
              <Th className="w-14">DR</Th>
              <Th className="w-20">Traffic</Th>
              <Th className="w-24 text-right">Guest post</Th>
              <Th className="w-24 text-right">Niche edit</Th>
              <Th className="w-20">Turnaround</Th>
              <Th className="w-10 text-right">
                <span className="sr-only">Edit</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const meta = statusMeta[row.status];
              const unique = (severity: 'error' | 'warning') =>
                Array.from(
                  new Set(
                    row.issues
                      .filter((issue) => issue.severity === severity)
                      .map((issue) => issue.message),
                  ),
                );
              const problems = unique('error');
              const notes = unique('warning');
              return (
                <Tr key={row.rowNumber} className={cn(row.status === 'error' && 'bg-red-50/40')}>
                  <Td className="pr-0">
                    <Checkbox
                      checked={row.selected}
                      onChange={() => onToggleRow(row.rowNumber)}
                      disabled={row.status === 'error'}
                      aria-label={`Include row ${row.rowNumber}`}
                    />
                  </Td>
                  <Td className="tabular text-[12px] text-muted">{row.rowNumber}</Td>
                  <Td>
                    <Badge tone={meta.tone}>
                      <meta.icon className="h-3 w-3" aria-hidden="true" />
                      {meta.label}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {row.domain || <span className="text-muted">No domain</span>}
                    </span>
                    {problems.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-negative">
                        {problems.join('; ')}
                      </span>
                    ) : notes.length > 0 ? (
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {notes.join('; ')}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="truncate text-[13px] text-ink-soft">
                    {row.values.primary_niche ? nicheName(row.values.primary_niche) : '—'}
                  </Td>
                  <Td className="text-[13px] text-ink-soft">{row.values.country ?? '—'}</Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    {row.values.domain_rating ?? '—'}
                  </Td>
                  <Td className="tabular text-[13px] text-ink-soft">
                    {row.values.organic_traffic !== undefined
                      ? formatCompactNumber(row.values.organic_traffic)
                      : '—'}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink-soft">
                    {row.values.guest_post_price !== undefined
                      ? `${currencySymbol}${row.values.guest_post_price}`
                      : '—'}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink-soft">
                    {row.values.niche_edit_price !== undefined
                      ? `${currencySymbol}${row.values.niche_edit_price}`
                      : '—'}
                  </Td>
                  <Td className="tabular text-[13px] whitespace-nowrap text-ink-soft">
                    {row.values.turnaround_min_days === undefined
                      ? '—'
                      : row.values.turnaround_max_days === undefined ||
                          row.values.turnaround_max_days === row.values.turnaround_min_days
                        ? `${row.values.turnaround_min_days} d`
                        : `${row.values.turnaround_min_days}-${row.values.turnaround_max_days} d`}
                  </Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit row ${row.rowNumber}`}
                      onClick={() => setEditing(editing === row.rowNumber ? null : row.rowNumber)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>

      {editing !== null ? (
        <RowEditor
          row={rows.find((row) => row.rowNumber === editing)!}
          onEdit={(header, value) => onEditRow(editing, header, value)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

/** Inline fix-up, so one bad cell does not mean re-uploading the file. */
function RowEditor({
  row,
  onEdit,
  onClose,
}: {
  row: PreparedRow;
  onEdit: (header: string, value: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-ink">
          Editing row {row.rowNumber}
          {row.domain ? ` · ${row.domain}` : ''}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>

      {row.issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {row.issues.map((issue, index) => (
            <li
              key={index}
              className={cn(
                'text-[12px]',
                issue.severity === 'error' ? 'text-negative' : 'text-muted',
              )}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(row.raw).map(([header, value]) => (
          <div key={header}>
            <label
              htmlFor={`edit-${row.rowNumber}-${header}`}
              className="block text-[12px] font-medium text-ink-soft"
            >
              {header}
            </label>
            <Input
              id={`edit-${row.rowNumber}-${header}`}
              defaultValue={value}
              onBlur={(event) => onEdit(header, event.target.value)}
              className="mt-1 h-9 text-[13px]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
