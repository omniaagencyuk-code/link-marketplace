import { isForeign, moneyOf, slices, type PlannerGroup, type Slice } from './summary';
import { monthLabel } from './domain-key';
import type { PlannerStatus } from '@/lib/types/planner';

/**
 * The Reports tab's seven answers.
 *
 * ## All of them come from the customer's own rows
 *
 * Nothing here calls anything. No model, no Ahrefs, no crawl, no scheduled
 * job - the brief's rule for the whole planner, and the reports are where
 * it would be most tempting to break it. A report that needed a figure we
 * do not hold is omitted rather than estimated: "Links live per month"
 * counts the rows a person marked live, and nothing here has ever looked
 * at a publisher's website to check.
 *
 * ## Spend has two halves and they are never added together
 *
 * `paidMinor` is money that has left. `committedMinor` is priced work still
 * to be paid for. One figure combining them would be a number that is
 * neither, and the definitions live in `summary.ts` so there is one copy.
 *
 * ## Months are the plan's months, not a calendar
 *
 * The rows a customer has are the months that appear. An empty month
 * between two full ones is filled in so the chart does not lie about the
 * gap, but nothing is invented before the first month or after the last -
 * a project started in March does not have a February.
 */

export interface MonthReportRow {
  month: string;
  label: string;
  planned: number;
  live: number;
  paidMinor: number;
  committedMinor: number;
  /** Counted apart, never converted. */
  foreign: number;
}

export interface SourceReportRow {
  source: string;
  count: number;
  paidMinor: number;
  committedMinor: number;
  foreign: number;
}

export interface StatusReportRow {
  statusId: string;
  name: string;
  colour: string;
  count: number;
  share: number;
}

export interface PlannerReport {
  /** True when there is nothing to report on at all. */
  empty: boolean;
  total: number;
  months: MonthReportRow[];
  sources: SourceReportRow[];
  linkTypes: Slice[];
  anchorTypes: Slice[];
  statuses: StatusReportRow[];
  /** Project totals, so the cards and the table agree. */
  paidMinor: number;
  committedMinor: number;
  otherCurrencies: { currency: string; count: number }[];
}

/** Every month from the first to the last, so a gap reads as a gap. */
function fillMonths(present: string[]): string[] {
  if (present.length === 0) return [];
  const sorted = [...new Set(present)].sort();
  const out: string[] = [];
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  let year = Number(first.slice(0, 4));
  let index = Number(first.slice(5, 7)) - 1;
  for (let guard = 0; guard < 600; guard += 1) {
    const at = new Date(Date.UTC(year, index, 1)).toISOString().slice(0, 10);
    out.push(at);
    if (at >= last) break;
    index += 1;
    if (index > 11) {
      index = 0;
      year += 1;
    }
  }
  return out;
}

export function buildReport(
  groups: PlannerGroup[],
  statuses: PlannerStatus[],
  currency: string,
): PlannerReport {
  const months = new Map<string, MonthReportRow>();
  const sources = new Map<string, SourceReportRow>();
  const statusCounts = new Map<string, number>();
  const otherCurrencies = new Map<string, number>();

  let total = 0;
  let paidMinor = 0;
  let committedMinor = 0;

  for (const group of groups) {
    const money = moneyOf(group);
    const foreign = isForeign(group, currency);

    if (group.dimension === 'month') {
      const row = months.get(group.bucket) ?? {
        month: group.bucket,
        label: monthLabel(group.bucket),
        planned: 0,
        live: 0,
        paidMinor: 0,
        committedMinor: 0,
        foreign: 0,
      };
      row.planned += group.count;
      if (group.category === 'live') row.live += group.count;
      if (foreign) {
        row.foreign += group.count;
      } else {
        row.paidMinor += money.paid;
        row.committedMinor += money.committed;
      }
      months.set(group.bucket, row);
      continue;
    }

    if (group.dimension === 'source') {
      const name = group.bucket.trim() || 'Not set';
      const row = sources.get(name) ?? {
        source: name,
        count: 0,
        paidMinor: 0,
        committedMinor: 0,
        foreign: 0,
      };
      row.count += group.count;
      if (foreign) {
        row.foreign += group.count;
      } else {
        row.paidMinor += money.paid;
        row.committedMinor += money.committed;
      }
      sources.set(name, row);
      continue;
    }

    if (group.dimension === 'status') {
      /* The status dimension is the one that counts each link exactly
         once, so the project totals are taken from it alone. */
      total += group.count;
      statusCounts.set(group.bucket, (statusCounts.get(group.bucket) ?? 0) + group.count);
      if (foreign) {
        otherCurrencies.set(
          group.currency ?? currency,
          (otherCurrencies.get(group.currency ?? currency) ?? 0) + group.count,
        );
      } else {
        paidMinor += money.paid;
        committedMinor += money.committed;
      }
    }
  }

  /* A month with nothing in it between two months that have something is a
     real zero, and a chart that skips it draws a flat line over a gap. */
  const monthRows = fillMonths([...months.keys()]).map(
    (month) =>
      months.get(month) ?? {
        month,
        label: monthLabel(month),
        planned: 0,
        live: 0,
        paidMinor: 0,
        committedMinor: 0,
        foreign: 0,
      },
  );

  const byId = new Map(statuses.map((status) => [status.id, status]));
  const statusRows: StatusReportRow[] = [...statusCounts.entries()]
    .map(([statusId, count]) => ({
      statusId,
      /* A status retired after the links were filed under it still names
         them. Dropping it would leave rows counted under nothing. */
      name: byId.get(statusId)?.name ?? 'Removed status',
      colour: byId.get(statusId)?.colour ?? '#94a3b8',
      count,
      share: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort(
      (a, b) =>
        (byId.get(a.statusId)?.sortOrder ?? 9999) - (byId.get(b.statusId)?.sortOrder ?? 9999) ||
        a.name.localeCompare(b.name),
    );

  return {
    empty: total === 0,
    total,
    months: monthRows,
    sources: [...sources.values()].sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
    linkTypes: slices(groups, 'linkType'),
    anchorTypes: slices(groups, 'anchorType'),
    statuses: statusRows,
    paidMinor,
    committedMinor,
    otherCurrencies: [...otherCurrencies.entries()]
      .map(([code, count]) => ({ currency: code, count }))
      .sort((a, b) => b.count - a.count),
  };
}
