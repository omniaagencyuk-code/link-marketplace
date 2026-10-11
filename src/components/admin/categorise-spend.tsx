import { formatCompactNumber, formatNumber } from '@/lib/utils/format';
import type { CategorySpend } from '@/lib/services/category-read-service';

/**
 * What the backlog has cost, and what the rest of it would.
 *
 * Both halves are measured. The first is the sum of what the API reported
 * for calls already made; the second is that divided by the calls it came
 * from and multiplied by the listings still to read. Nothing here is a
 * per-site figure somebody typed in, which is the only reason the
 * projection is worth printing at all - it moves as the real cost moves,
 * and before anything has been read it says so rather than guessing.
 *
 * The cached tokens are shown as their own figure rather than folded into
 * the input. They are the larger half of every request - the rules block
 * behind the cache breakpoint - and until 0080 they were recorded as
 * costing nothing, which made the whole of this line roughly half right.
 * Printing them apart is what makes that visible if it ever happens again.
 */

/**
 * Two decimals, except where two decimals would read as free.
 *
 * Twenty-odd Haiku reads come to well under a penny, and `$0.00` on a line
 * whose job is to report spend says something false. `<$0.01` says the
 * true thing, which is that it is too small to write down.
 */
function usd(value: number): string {
  if (value <= 0) return '$0.00';
  if (value < 0.01) return '<$0.01';
  return `$${value.toFixed(2)}`;
}

export function CategoriseSpend({ spend }: { spend: CategorySpend | null }) {
  // No database, no ledger, nothing true to say. A spend line that cannot be
  // counted says nothing rather than saying nothing has been spent.
  if (!spend) return null;

  const cachedTokens = spend.cacheWriteTokens + spend.cacheReadTokens;

  return (
    <section
      aria-label="What reading homepages has cost"
      className="mb-5 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5"
    >
      <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Figure
          value={usd(spend.spentUsd)}
          label={
            spend.reads === 0
              ? 'spent so far'
              : `spent across ${formatNumber(spend.pricedReads)} of ${formatNumber(spend.reads)} reads`
          }
        />

        <Figure
          value={spend.projectedUsd === null ? '—' : `≈${usd(spend.projectedUsd)}`}
          label={
            spend.projectedUsd === null
              ? `to read the remaining ${formatNumber(spend.remaining)} - no read measured yet`
              : `to read the remaining ${formatNumber(spend.remaining)}`
          }
        />

        <Figure
          value={`${formatCompactNumber(spend.inputTokens)} / ${formatCompactNumber(spend.outputTokens)}`}
          label="input / output tokens"
        />

        <Figure value={formatCompactNumber(cachedTokens)} label="cached tokens" />
      </dl>

      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        Measured from the tokens the API reported, not estimated. A cache write is priced at 1.25
        times an input token and a cache read at a tenth, so the three are counted apart. Reads
        that never reached the model - a page that would not load - cost nothing and are left out
        of the projection.
      </p>
    </section>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="tabular block text-[18px] leading-tight font-semibold text-ink">
          {value}
        </span>
        <span className="block text-[12px] text-muted">{label}</span>
      </dd>
    </div>
  );
}
