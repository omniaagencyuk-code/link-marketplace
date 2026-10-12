import { formatNumber, formatPrice } from '@/lib/utils/format';
import { STATUS_CATEGORY_LABELS, type StatusCategory } from '@/lib/types/planner';
import type { MonthSummary, Slice } from '@/lib/planner/summary';

/**
 * The four cards over the plan.
 *
 * ## The palette was validated, not chosen
 *
 * Only one of these encodes identity by colour - the link-type doughnut -
 * and its five hues were run through the colour-vision checks rather than
 * picked by eye: lightness band, chroma floor, adjacent-pair separation
 * under deuteranopia, protanopia and tritanopia, and contrast against the
 * surface. The tritan separation lands in the band that is only acceptable
 * with a second encoding, so every segment is named and given its share in
 * the legend beside it. Nothing here is identified by colour alone.
 *
 * Every hue is one the application already uses: accent green, the brand
 * blue, the warning amber, the status violet and the coral.
 *
 * The other three cards are single-series - progress, budget, and a set of
 * directly-labelled rows - so they wear one hue and carry no legend.
 *
 * ## Nothing is invented
 *
 * Counts come from the customer's own rows. A missing target shows counts
 * and no percentage; a missing budget shows no bar. Prices in a currency
 * other than the project's are counted apart and named, because there is no
 * exchange rate here and inventing one would make a wrong number look
 * precise.
 */

/* Validated with the dataviz palette checker: every pair clears the
   lightness, chroma, CVD-separation and contrast checks against a light
   surface. Fixed order - a type that disappears from a month must not
   repaint the ones that remain. */
const TYPE_COLOURS = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#dd4a20'];
const OVERFLOW_COLOUR = '#94a3b8';

const PROGRESS_ORDER: StatusCategory[] = [
  'live',
  'in_progress',
  'scheduled',
  'waiting',
  'planned',
  'lost',
  'cancelled',
];

export function PlannerOverview({
  summary,
  currency,
  monthName,
}: {
  summary: MonthSummary;
  currency: string;
  monthName: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <CampaignProgress summary={summary} />
      <BudgetOverview summary={summary} currency={currency} />
      <LinkTypes slices={summary.linkTypes} total={summary.total} monthName={monthName} />
      <AnchorTypes slices={summary.anchorTypes} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Progress to the month's target.
 *
 * One series, so no legend: the ring is the headline and the rows beside it
 * are the breakdown. With no target set the ring is not drawn at all and
 * the counts stand on their own - a 0% against a target nobody chose reads
 * as a failure at something that was never agreed.
 */
function CampaignProgress({ summary }: { summary: MonthSummary }) {
  const { progress, target, byCategory, total } = summary;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, progress ?? 0));

  return (
    <Card title="Campaign progress">
      <div className="flex items-center gap-4">
        {progress === null ? (
          <div className="shrink-0">
            <p className="tabular text-[26px] leading-none font-semibold text-ink">{total}</p>
            <p className="mt-1 text-[12px] text-muted">
              {total === 1 ? 'link' : 'links'} planned
            </p>
          </div>
        ) : (
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="6" className="stroke-surface-sunken" />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${(shown / 100) * circumference} ${circumference}`}
                className="stroke-accent-600"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="tabular text-[15px] font-semibold text-ink">{shown}%</span>
            </span>
          </div>
        )}

        <dl className="min-w-0 flex-1 space-y-0.5">
          {PROGRESS_ORDER.filter((category) => byCategory[category] > 0).map((category) => (
            <div key={category} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-[12px] text-muted">
                {STATUS_CATEGORY_LABELS[category]}
              </dt>
              <dd className="tabular shrink-0 text-[12px] font-semibold text-ink">
                {byCategory[category]}
              </dd>
            </div>
          ))}
          {total === 0 ? <p className="text-[12px] text-muted">Nothing planned yet.</p> : null}
        </dl>
      </div>

      {target !== null ? (
        <p className="mt-3 text-[12px] text-muted">
          <span className="tabular font-semibold text-ink">{byCategory.live}</span> live of a
          target of <span className="tabular font-semibold text-ink">{target}</span>
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-muted">
          No target set for this month, so there is no percentage to show.
        </p>
      )}
    </Card>
  );
}

/**
 * Money.
 *
 * Two remaining figures, because they answer different questions. One takes
 * off what has been paid and what is still owed on work in flight - what is
 * genuinely left to commit. The other takes off only what has actually gone
 * out, which is what somebody reconciling against a bank statement wants.
 */
function BudgetOverview({ summary, currency }: { summary: MonthSummary; currency: string }) {
  const { budgetMinor, paidMinor, committedMinor, remainingMinor, remainingAfterPaidMinor } =
    summary;
  const money = (minor: number) => formatPrice(minor, { currency });

  const usedShare =
    budgetMinor && budgetMinor > 0
      ? Math.min(100, Math.round(((paidMinor + committedMinor) / budgetMinor) * 100))
      : 0;
  const paidShare =
    budgetMinor && budgetMinor > 0
      ? Math.min(100, Math.round((paidMinor / budgetMinor) * 100))
      : 0;

  return (
    <Card title="Budget">
      {budgetMinor === null ? (
        <div>
          <p className="tabular text-[22px] leading-none font-semibold text-ink">
            {money(paidMinor)}
          </p>
          <p className="mt-1 text-[12px] text-muted">paid so far</p>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            No budget set for this month. Set one above and this shows what is left.
          </p>
        </div>
      ) : (
        <div>
          <p className="tabular text-[22px] leading-none font-semibold text-ink">
            {money(paidMinor)}
            <span className="text-[13px] font-normal text-muted"> / {money(budgetMinor)}</span>
          </p>

          {/*
            Two segments in one track: paid, then committed-but-unpaid, with
            a 2px gap between them so they read as two things rather than
            one long bar. The track is the remainder.
          */}
          <div
            className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
            role="img"
            aria-label={`${money(paidMinor)} paid and ${money(committedMinor)} committed, of a ${money(budgetMinor)} budget`}
          >
            <span className="h-full rounded-full bg-accent-600" style={{ width: `${paidShare}%` }} />
            {usedShare > paidShare ? (
              <span
                className="ml-0.5 h-full rounded-full bg-accent-300"
                style={{ width: `${Math.max(0, usedShare - paidShare)}%` }}
              />
            ) : null}
          </div>

          <dl className="mt-3 space-y-1">
            <Row label="Paid" value={money(paidMinor)} />
            <Row label="Committed, not yet paid" value={money(committedMinor)} />
            <Row
              label="Left to commit"
              value={remainingMinor === null ? '—' : money(remainingMinor)}
              strong
            />
            <Row
              label="Left before payment"
              value={remainingAfterPaidMinor === null ? '—' : money(remainingAfterPaidMinor)}
            />
          </dl>
        </div>
      )}

      {summary.otherCurrencies.length > 0 ? (
        <p className="mt-3 border-t border-line pt-2 text-[12px] leading-relaxed text-muted">
          Not counted above:{' '}
          {summary.otherCurrencies
            .map((entry) => `${entry.count} in ${entry.currency}`)
            .join(', ')}
          . There is no exchange rate here, so they are listed rather than converted.
        </p>
      ) : null}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={
          strong
            ? 'tabular text-[12px] font-semibold text-ink'
            : 'tabular text-[12px] text-ink-soft'
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Link types, as a doughnut.
 *
 * The one card that identifies by colour, so every segment is named with
 * its share in the legend beside it - the second encoding the colour-vision
 * check requires, and the thing that makes the card readable in print or
 * greyscale too.
 *
 * Six slots: five fixed hues in a fixed order plus one grey for everything
 * past the fifth, gathered rather than given a sixth generated colour.
 */
function LinkTypes({
  slices,
  total,
  monthName,
}: {
  slices: Slice[];
  total: number;
  monthName: string;
}) {
  if (total === 0) {
    return (
      <Card title="Link type breakdown">
        <p className="text-[12px] text-muted">Nothing planned for {monthName} yet.</p>
      </Card>
    );
  }

  const head = slices.slice(0, 5);
  const tail = slices.slice(5);
  const shown = tail.length
    ? [...head, { label: 'Other', count: tail.reduce((sum, s) => sum + s.count, 0), share: 0 }]
    : head;

  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  /*
    The arcs are worked out before anything renders, rather than by
    accumulating an offset inside the map. A variable mutated while JSX is
    being produced is a render that depends on how many times it ran, and
    React is explicit that this is not allowed.
  */
  const fractions = shown.map((slice) => (total === 0 ? 0 : slice.count / total));
  /* Cumulative, without mutating anything: each arc starts where all the
     arcs before it ended. Quadratic over at most six slices, which is the
     cheapest way to keep render free of side effects. */
  const startOf = (index: number) =>
    fractions.slice(0, index).reduce((sum, value) => sum + value, 0) * circumference;

  const segments = shown.map((slice, index) => {
    const fraction = fractions[index] ?? 0;
    return {
      label: slice.label,
      colour: TYPE_COLOURS[index] ?? OVERFLOW_COLOUR,
      share: Math.round(fraction * 100),
      /* A 2px gap between arcs so two hues never touch - the second
         encoding the colour-vision check asks for, alongside the labels. */
      length: Math.max(0, fraction * circumference - 2),
      offset: startOf(index),
    };
  });

  return (
    <Card title="Link type breakdown">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
            {segments.map((segment) => (
              <circle
                key={segment.label}
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                strokeWidth="6"
                strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                strokeDashoffset={-segment.offset}
                stroke={segment.colour}
              />
            ))}
          </svg>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="tabular text-[15px] font-semibold text-ink">{total}</span>
          </span>
        </div>

        <ul className="min-w-0 flex-1 space-y-0.5">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-baseline gap-1.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: segment.colour }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                {segment.label}
              </span>
              <span className="tabular shrink-0 text-[12px] font-semibold text-ink">
                {segment.share}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

/**
 * Anchor types, as rows.
 *
 * One hue, because each bar is already named on its own line - identity
 * comes from position and label, so a second colour scheme here would be
 * decoration that a colour-blind reader has to decode for nothing.
 */
function AnchorTypes({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return (
      <Card title="Anchor text distribution">
        <p className="text-[12px] text-muted">No anchors classified yet.</p>
      </Card>
    );
  }

  const widest = Math.max(...slices.map((slice) => slice.count), 1);

  return (
    <Card title="Anchor text distribution">
      <ul className="space-y-1.5">
        {slices.slice(0, 6).map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-[12px] text-muted" title={slice.label}>
              {slice.label}
            </span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="block h-full rounded-full bg-accent-500"
                style={{ width: `${Math.max(3, (slice.count / widest) * 100)}%` }}
              />
            </span>
            <span className="tabular w-9 shrink-0 text-right text-[12px] font-semibold text-ink">
              {slice.share}%
            </span>
          </li>
        ))}
      </ul>
      {slices.length > 6 ? (
        <p className="mt-2 text-[12px] text-muted">
          and {formatNumber(slices.length - 6)} more
        </p>
      ) : null}
    </Card>
  );
}
