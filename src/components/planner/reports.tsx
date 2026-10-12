import { formatNumber, formatPrice } from '@/lib/utils/format';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import type { PlannerReport } from '@/lib/planner/reports';
import type { Slice } from '@/lib/planner/summary';

/**
 * The Reports tab.
 *
 * Seven answers, all of them arithmetic over the customer's own rows:
 * links planned and live per month, spend by month and by source, and the
 * link type, anchor type and status breakdowns. Nothing is fetched,
 * crawled, estimated or asked of a model, and a report that would need a
 * figure we do not hold is not drawn rather than filled in.
 *
 * ## "Live" means somebody said so
 *
 * Every live count here is rows a person marked live. The planner has
 * never looked at a publisher's website and the wording says so where it
 * is shown, because "links live per month" read as a verified figure is
 * exactly the claim the brief forbids.
 *
 * ## Paid and committed are never added together
 *
 * Two columns, two definitions, from `summary.ts`. A single "spend"
 * column combining them would be a number that is neither, and it is the
 * one somebody would put in a client report.
 *
 * ## Why these are bars and not charts
 *
 * Every series here is one measure against a labelled category, and the
 * value is printed beside each bar. A chart library for that is a
 * dependency to render numbers that are already on the screen - and the
 * brief's own rule is not to add heavy dependencies unnecessarily. The one
 * place colour carries identity on this page is the status list, where
 * each row also carries its name.
 */
export function PlannerReports({
  report,
  currency,
  projectName,
}: {
  report: PlannerReport;
  currency: string;
  projectName: string;
}) {
  if (report.empty) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]">
        <p className="text-[15px] font-semibold text-ink">Nothing to report on yet</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">
          Reports are built from the links in this project. Add a few on the Overview tab, or
          import a spreadsheet, and every figure here fills itself in.
        </p>
      </div>
    );
  }

  const peakPlanned = Math.max(...report.months.map((row) => row.planned), 1);
  const peakSpend = Math.max(
    ...report.months.map((row) => row.paidMinor + row.committedMinor),
    1,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Links in this plan" value={formatNumber(report.total)} />
        <Figure label="Paid so far" value={formatPrice(report.paidMinor, { currency })} />
        <Figure
          label="Committed, not yet paid"
          value={formatPrice(report.committedMinor, { currency })}
        />
      </div>

      {report.otherCurrencies.length > 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2 text-[12px] text-ink-soft">
          Not counted in the money figures:{' '}
          {report.otherCurrencies
            .map((other) => `${formatNumber(other.count)} in ${other.currency}`)
            .join(', ')}
          . There is no exchange rate here, so they are listed rather than converted.
        </p>
      ) : null}

      {/* ------------------------------------------------- links per month */}
      <Panel
        title="Links per month"
        note="Planned is every link filed into that month. Live is the ones you have marked live - the planner has never checked a publisher's website."
      >
        <TableWrap className="border-0 shadow-none">
          <Table>
            <caption className="sr-only">
              Links planned and live per month for {projectName}
            </caption>
            <thead>
              <tr>
                <Th className="w-40">Month</Th>
                <Th className="w-24 text-right">Planned</Th>
                <Th className="w-24 text-right">Live</Th>
                {/* Decoration: every figure it draws is printed beside
                    it. Gone on a phone, where the column would be 40px
                    wide and the heading three lines tall. */}
                <Th className="hidden sm:table-cell">Share of the month planned that is live</Th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((row) => (
                <Tr key={row.month}>
                  <Td className="font-medium text-ink">{row.label}</Td>
                  <Td className="tabular text-right">{formatNumber(row.planned)}</Td>
                  <Td className="tabular text-right">{formatNumber(row.live)}</Td>
                  <Td className="hidden sm:table-cell">
                    <Bars
                      total={peakPlanned}
                      parts={[
                        { value: row.live, className: 'bg-accent-600' },
                        { value: row.planned - row.live, className: 'bg-accent-200' },
                      ]}
                      /* A month that is in the range but has nothing in it
                         is a real zero, and saying so beats a blank row
                         somebody reads as missing data. */
                      empty={row.planned === 0 ? 'Nothing planned' : undefined}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      {/* ------------------------------------------------- spend per month */}
      <Panel
        title={`Spend by month (${currency})`}
        note="Paid is money that has left. Committed is priced work still to be paid for - a link going live does not make it paid."
      >
        <TableWrap className="border-0 shadow-none">
          <Table>
            <caption className="sr-only">Spend by month for {projectName}</caption>
            <thead>
              <tr>
                <Th className="w-40">Month</Th>
                <Th className="w-28 text-right">Paid</Th>
                <Th className="w-32 text-right">Committed</Th>
                <Th className="hidden sm:table-cell">Paid against committed</Th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((row) => (
                <Tr key={row.month}>
                  <Td className="font-medium text-ink">{row.label}</Td>
                  <Td className="tabular text-right">{formatPrice(row.paidMinor, { currency })}</Td>
                  <Td className="tabular text-right">
                    {formatPrice(row.committedMinor, { currency })}
                  </Td>
                  <Td className="hidden sm:table-cell">
                    <Bars
                      total={peakSpend}
                      parts={[
                        { value: row.paidMinor, className: 'bg-accent-600' },
                        { value: row.committedMinor, className: 'bg-accent-200' },
                      ]}
                      empty={
                        row.paidMinor + row.committedMinor === 0 ? 'Nothing priced' : undefined
                      }
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      {/* ------------------------------------------------------- by source */}
      <Panel
        title="Spend by source"
        note="Where the links came from, and what each one has cost. Your own suppliers sit beside Press Parrot; nothing here is shared with anybody."
      >
        <TableWrap className="border-0 shadow-none">
          <Table>
            <caption className="sr-only">Links and spend by source for {projectName}</caption>
            <thead>
              <tr>
                <Th className="w-44">Source</Th>
                <Th className="w-20 text-right">Links</Th>
                <Th className="w-28 text-right">Paid</Th>
                <Th className="w-32 text-right">Committed</Th>
                <Th className="w-32 text-right">Average paid</Th>
              </tr>
            </thead>
            <tbody>
              {report.sources.map((row) => {
                /* Averaged over the links we can price in this currency,
                   not over every link with this source: dividing by rows
                   priced in euros would report an average nobody paid. */
                const priced = row.count - row.foreign;
                return (
                  <Tr key={row.source}>
                    <Td className="font-medium text-ink">{row.source}</Td>
                    <Td className="tabular text-right">{formatNumber(row.count)}</Td>
                    <Td className="tabular text-right">{formatPrice(row.paidMinor, { currency })}</Td>
                    <Td className="tabular text-right">
                      {formatPrice(row.committedMinor, { currency })}
                    </Td>
                    <Td className="tabular text-right">
                      {priced > 0 && row.paidMinor > 0
                        ? formatPrice(Math.round(row.paidMinor / priced), { currency })
                        : '—'}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Link type breakdown">
          <SliceList slices={report.linkTypes} />
        </Panel>
        <Panel title="Anchor type distribution">
          <SliceList slices={report.anchorTypes} />
        </Panel>
        <Panel title="Status breakdown" note="Your statuses, in your order.">
          <ul className="space-y-1.5">
            {report.statuses.map((row) => (
              <li key={row.statusId} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.colour }}
                />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={row.name}>
                  {row.name}
                </span>
                <span className="tabular shrink-0 text-[12px] font-semibold text-ink">
                  {formatNumber(row.count)}
                </span>
                <span className="tabular w-9 shrink-0 text-right text-[12px] text-muted">
                  {row.share}%
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-4 shadow-[var(--shadow-card)]">
      <p className="text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">{label}</p>
      <p className="tabular mt-1 text-[22px] font-semibold text-ink">{value}</p>
    </div>
  );
}

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]">
      <header className="border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
        {note ? <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{note}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * A two-part bar, scaled against the biggest row rather than against its
 * own total - so the rows can be compared with each other, which is the
 * only reason to draw a bar beside a number that is already printed.
 */
function Bars({
  total,
  parts,
  empty,
}: {
  total: number;
  parts: { value: number; className: string }[];
  empty?: string;
}) {
  if (empty) return <span className="text-[12px] text-muted">{empty}</span>;
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
      {parts.map((part, index) => (
        <span
          key={index}
          className={part.className}
          style={{ width: `${Math.max(0, (part.value / total) * 100)}%` }}
        />
      ))}
    </span>
  );
}

function SliceList({ slices }: { slices: Slice[] }) {
  if (slices.length === 0) {
    return <p className="text-[12px] text-muted">Nothing recorded yet.</p>;
  }
  const widest = Math.max(...slices.map((slice) => slice.count), 1);
  return (
    <ul className="space-y-1.5">
      {slices.map((slice) => (
        <li key={slice.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-[12px] text-muted" title={slice.label}>
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
  );
}
