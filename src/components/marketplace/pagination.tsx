'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { pageSizeOptions } from '@/lib/utils/labels';
import { cn } from '@/lib/utils/cn';

/** Build a page list with ellipses, e.g. 1 2 3 4 5 ... 42 */
function pageRange(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push('gap');
  for (let page = start; page <= end; page += 1) pages.push(page);
  if (end < total - 1) pages.push('gap');
  pages.push(total);
  return pages;
}

export function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Marketplace pagination"
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="tabular text-[13px] text-muted">
        Showing <span className="font-medium text-ink">{from}</span>-
        <span className="font-medium text-ink">{to}</span> of{' '}
        <span className="font-medium text-ink">{total.toLocaleString('en-GB')}</span> websites
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <PageButton
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Previous</span>
          </PageButton>

          {pageRange(page, totalPages).map((entry, index) =>
            entry === 'gap' ? (
              <span
                key={`gap-${index}`}
                className="px-1.5 text-[13px] text-muted-soft"
                aria-hidden="true"
              >
                ...
              </span>
            ) : (
              <PageButton
                key={entry}
                onClick={() => onPageChange(entry)}
                active={entry === page}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? 'page' : undefined}
              >
                {entry}
              </PageButton>
            ),
          )}

          <PageButton
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </PageButton>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="page-size" className="text-[13px] whitespace-nowrap text-muted">
            Show
          </label>
          <Select
            id="page-size"
            size="sm"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="w-[6.5rem]"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} per page
              </option>
            ))}
          </Select>
        </div>
      </div>
    </nav>
  );
}

function PageButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'tabular inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-[13px] font-medium transition-colors',
        active
          ? 'border-navy-900 bg-navy-900 text-white'
          : 'border-line-strong bg-white text-ink-soft hover:border-muted-soft hover:text-ink',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-strong',
        className,
      )}
      {...props}
    />
  );
}
