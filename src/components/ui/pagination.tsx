'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { PAGE_SIZES, pageWindow, type PageSize, type Paged } from '@/lib/admin/paging';
import { formatNumber } from '@/lib/utils/format';

/**
 * Page numbers and a page size, under a long table.
 *
 * The size sits beside the numbers rather than in a settings menu, because
 * the reason to change it is always the job in front of you: twenty-five to
 * read carefully, all of them to select and act on at once.
 */
export function Pagination<T>({
  paged,
  size,
  onPage,
  onSize,
  noun = 'rows',
  className,
}: {
  paged: Paged<T>;
  size: PageSize;
  onPage: (page: number) => void;
  onSize: (size: PageSize) => void;
  noun?: string;
  className?: string;
}) {
  const numbers = pageWindow(paged.page, paged.pages);

  return (
    // A navigation landmark, so that someone moving by landmark can reach
    // the page numbers without walking the whole table first.
    <nav
      aria-label={`${noun} pagination`}
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      <p className="tabular text-[13px] text-muted">
        {paged.total === 0
          ? `No ${noun}`
          : `${formatNumber(paged.from)}-${formatNumber(paged.to)} of ${formatNumber(paged.total)} ${noun}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Per page
          <Select
            size="sm"
            aria-label="Rows per page"
            value={String(size)}
            onChange={(event) => onSize(Number(event.target.value) as PageSize)}
            className="w-24"
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {/* Worth offering: selecting everything to act on it is the one
                job a page break gets in the way of. */}
            <option value={0}>All</option>
          </Select>
        </label>

        {paged.pages > 1 ? (
          <div className="flex items-center gap-1">
            <PageButton
              label="Previous page"
              disabled={paged.page <= 1}
              onClick={() => onPage(paged.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </PageButton>

            {numbers.map((number, index) =>
              number == null ? (
                <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-[12px] text-muted">
                  &hellip;
                </span>
              ) : (
                <PageButton
                  key={number}
                  label={`Page ${number}`}
                  current={number === paged.page}
                  onClick={() => onPage(number)}
                >
                  {number}
                </PageButton>
              ),
            )}

            <PageButton
              label="Next page"
              disabled={paged.page >= paged.pages}
              onClick={() => onPage(paged.page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </PageButton>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function PageButton({
  children,
  label,
  current,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      // Announced as the page you are on, rather than only looking like it.
      aria-current={current ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'tabular inline-flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-[12px] transition-colors',
        current
          ? 'border-accent-600 bg-accent-600 font-medium text-white'
          : 'border-line text-ink-soft hover:border-muted-soft hover:bg-surface',
        disabled && 'cursor-not-allowed opacity-40 hover:border-line hover:bg-transparent',
      )}
    >
      {children}
    </button>
  );
}
