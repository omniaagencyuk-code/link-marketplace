import { randomUUID } from 'node:crypto';
import { monthStart } from '@/lib/planner/domain-key';
import { STATUS_CATEGORIES } from '@/lib/types/planner';
import type { PlannerGroup } from '@/lib/planner/summary';
import {
  compareLinks,
  matchesFilter,
  statusOrdering,
  type PlannerFilter,
  type PlannerSort,
} from '@/lib/planner/filter';
import type {
  MonthSettings,
  PlannerLink,
  PlannerLinkPatch,
  PlannerProject,
  PlannerStatus,
  StatusCategory,
} from '@/lib/types/planner';

/**
 * The planner, without a database.
 *
 * Every service in this application has one of these, and the reason is
 * that the app has to run from a clone with no credentials - which is what
 * makes a screen reviewable before anybody has pointed it at Supabase.
 *
 * It is per-process and it is not durable: a serverless instance restarting
 * loses it. That is correct for what it is. Nothing here is reachable when
 * `isSupabaseEnabled()` is true, so no customer's data passes through it.
 */

/**
 * The owner sits beside the row, not inside it.
 *
 * Mixing `userId` into the row means stripping it off again on every read,
 * and the one place somebody forgets is the one place an account id leaks
 * into a component. Holding it as a wrapper makes the strip structural.
 */
interface Owned<T> {
  userId: string;
  row: T;
}

interface Store {
  projects: Map<string, Owned<PlannerProject>>;
  months: Map<string, Owned<MonthSettings & { projectId: string }>>;
  statuses: Map<string, Owned<PlannerStatus>>;
  sources: Map<string, { userId: string; name: string }>;
  links: Map<string, Owned<PlannerLink>>;
}

/* Keyed off globalThis so every copy of the module shares one store - the
   same trick the in-memory rate limiter uses, and for the same reason. */
const KEY = Symbol.for('pressparrot.planner-mock');

function store(): Store {
  const host = globalThis as typeof globalThis & { [KEY]?: Store };
  host[KEY] ??= {
    projects: new Map(),
    months: new Map(),
    statuses: new Map(),
    sources: new Map(),
    links: new Map(),
  };
  return host[KEY];
}

const DEFAULT_STATUSES: [string, string, StatusCategory][] = [
  ['Planned', '#64748b', 'planned'],
  ['Outreach Sent', '#64748b', 'in_progress'],
  ['Awaiting Response', '#64748b', 'in_progress'],
  ['Approved', '#2563eb', 'in_progress'],
  ['Ordered', '#2563eb', 'in_progress'],
  ['In Progress', '#2563eb', 'in_progress'],
  ['Scheduled', '#7c3aed', 'scheduled'],
  ['Waiting to Go Live', '#d97706', 'waiting'],
  ['Live', '#059669', 'live'],
  ['Lost', '#dc2626', 'lost'],
  ['Cancelled', '#8595a6', 'cancelled'],
];

const now = () => new Date().toISOString();

export const plannerMock = {
  projects(userId: string): PlannerProject[] {
    return [...store().projects.values()]
      .filter((entry) => entry.userId === userId && !entry.row.archivedAt)
      .map((entry) => entry.row);
  },

  saveProject(
    userId: string,
    input: {
      id?: string;
      name: string;
      domain: string;
      country: string;
      currency: string;
      monthlyBudgetMinor: number | null;
      monthlyLinkTarget: number | null;
      notes: string;
    },
  ): PlannerProject {
    const db = store();
    // The same (user, domain) uniqueness the real table enforces, so the
    // mock cannot accept a shape the database would refuse.
    const existing =
      (input.id ? db.projects.get(input.id) : undefined) ??
      [...db.projects.values()].find(
        (entry) => entry.userId === userId && entry.row.domain === input.domain,
      );

    const row: PlannerProject = {
      id: existing?.row.id ?? randomUUID(),
      name: input.name,
      domain: input.domain,
      country: input.country,
      currency: input.currency,
      monthlyBudgetMinor: input.monthlyBudgetMinor,
      monthlyLinkTarget: input.monthlyLinkTarget,
      notes: input.notes,
      archivedAt: null,
    };
    db.projects.set(row.id, { userId, row });
    return row;
  },

  archiveProject(userId: string, projectId: string): boolean {
    const entry = store().projects.get(projectId);
    if (!entry || entry.userId !== userId) return false;
    entry.row.archivedAt = now();
    return true;
  },

  monthSettings(userId: string, project: PlannerProject, month: string): MonthSettings {
    const entry = store().months.get(`${project.id}:${month}`);
    if (!entry || entry.userId !== userId) {
      return {
        month,
        budgetMinor: project.monthlyBudgetMinor,
        linkTarget: project.monthlyLinkTarget,
        fromProjectDefaults: true,
      };
    }
    return {
      month,
      budgetMinor: entry.row.budgetMinor ?? project.monthlyBudgetMinor,
      linkTarget: entry.row.linkTarget ?? project.monthlyLinkTarget,
      fromProjectDefaults: false,
    };
  },

  saveMonth(
    userId: string,
    projectId: string,
    month: string,
    patch: { budgetMinor: number | null; linkTarget: number | null },
  ): boolean {
    const at = monthStart(month);
    store().months.set(`${projectId}:${at}`, {
      userId,
      row: {
        projectId,
        month: at,
        budgetMinor: patch.budgetMinor,
        linkTarget: patch.linkTarget,
        fromProjectDefaults: false,
      },
    });
    return true;
  },

  statuses(userId: string): PlannerStatus[] {
    const db = store();
    const mine = [...db.statuses.values()].filter((entry) => entry.userId === userId);
    if (mine.length === 0) {
      DEFAULT_STATUSES.forEach(([name, colour, category], index) => {
        const row: PlannerStatus = {
          id: randomUUID(),
          name,
          colour,
          category,
          sortOrder: (index + 1) * 10,
          archivedAt: null,
        };
        db.statuses.set(row.id, { userId, row });
      });
    }
    return [...db.statuses.values()]
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.row)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },

  saveStatus(
    userId: string,
    input: {
      id?: string;
      name: string;
      colour: string;
      category: StatusCategory;
      sortOrder: number;
    },
  ): PlannerStatus {
    const db = store();
    const id = input.id ?? randomUUID();
    const row: PlannerStatus = {
      id,
      name: input.name,
      colour: input.colour,
      category: STATUS_CATEGORIES.includes(input.category) ? input.category : 'planned',
      sortOrder: input.sortOrder,
      archivedAt: db.statuses.get(id)?.row.archivedAt ?? null,
    };
    db.statuses.set(id, { userId, row });
    return row;
  },

  retireStatus(userId: string, statusId: string): { outcome: 'deleted' | 'archived' } {
    const db = store();
    const entry = db.statuses.get(statusId);
    if (!entry || entry.userId !== userId) return { outcome: 'deleted' };

    // The same rule the real `on delete restrict` enforces: a status with
    // links on it is archived, never removed from under them.
    const inUse = [...db.links.values()].some((link) => link.row.statusId === statusId);
    if (inUse) {
      entry.row.archivedAt = now();
      return { outcome: 'archived' };
    }
    db.statuses.delete(statusId);
    return { outcome: 'deleted' };
  },

  sources(userId: string): string[] {
    return [...store().sources.values()]
      .filter((source) => source.userId === userId)
      .map((source) => source.name)
      .sort((a, b) => a.localeCompare(b));
  },

  addSource(userId: string, name: string): boolean {
    store().sources.set(`${userId}:${name}`, { userId, name });
    return true;
  },

  /**
   * The same filter and the same order as the database, from the same rules.
   *
   * `matchesFilter` and `compareLinks` are the ones `planner-service`
   * translates into PostgREST, applied here directly. Writing the predicate
   * twice is how the two paths come to disagree, and a reviewer running
   * from a clone only ever sees this one.
   */
  links(
    userId: string,
    options: {
      projectId: string;
      month: string | null;
      page: number;
      pageSize: number;
      filter: PlannerFilter;
      sort: PlannerSort;
    },
  ): { items: PlannerLink[]; total: number } {
    const db = store();
    const order = statusOrdering(
      [...db.statuses.values()].filter((entry) => entry.userId === userId).map((entry) => entry.row),
    );

    const all = [...db.links.values()]
      .filter(
        (entry) =>
          entry.userId === userId &&
          entry.row.projectId === options.projectId &&
          (options.month === null || entry.row.planMonth === options.month),
      )
      .map((entry) => entry.row)
      .filter((row) => matchesFilter(row, options.filter))
      .sort((a, b) => compareLinks(a, b, options.sort, order));

    const from = (options.page - 1) * options.pageSize;
    return { items: all.slice(from, from + options.pageSize), total: all.length };
  },

  linksByIds(userId: string, linkIds: string[]): PlannerLink[] {
    const db = store();
    return linkIds
      .map((id) => db.links.get(id))
      .filter((entry): entry is { userId: string; row: PlannerLink } =>
        Boolean(entry && entry.userId === userId),
      )
      .map((entry) => entry.row);
  },

  /**
   * The same grouping the database does, in memory.
   *
   * Written against the same definitions rather than beside them: the
   * three sums are what `planner_report_rows` emits and what `moneyOf`
   * expects, including the per-row clamp on what is still owed. Summing
   * first and clamping after would let one overpaid row pay off another's
   * shortfall, which is the one place these two could disagree.
   */
  groups(userId: string, projectId: string, month: string | null): PlannerGroup[] {
    const db = store();
    const categoryOf = new Map(
      [...db.statuses.values()]
        .filter((entry) => entry.userId === userId)
        .map((entry) => [entry.row.id, entry.row.category] as const),
    );

    const out = new Map<string, PlannerGroup>();

    for (const entry of db.links.values()) {
      if (entry.userId !== userId) continue;
      if (entry.row.projectId !== projectId) continue;
      if (month !== null && entry.row.planMonth !== month) continue;

      const row = entry.row;
      const category = categoryOf.get(row.statusId) ?? 'planned';
      const price = row.priceMinor ?? 0;
      const paid =
        row.paymentStatus === 'paid'
          ? price
          : row.paymentStatus === 'partially_paid'
            ? (row.paidMinor ?? 0)
            : 0;

      const buckets: [PlannerGroup['dimension'], string][] = [
        ['month', row.planMonth],
        ['source', row.source],
        ['linkType', row.linkType],
        ['anchorType', row.anchorType],
        ['status', row.statusId],
      ];

      for (const [dimension, bucket] of buckets) {
        const key = [dimension, bucket, category, row.paymentStatus, row.currency ?? ''].join('\u0000');
        const group = out.get(key) ?? {
          dimension,
          bucket,
          category,
          paymentStatus: row.paymentStatus,
          currency: row.currency,
          count: 0,
          priceSum: 0,
          paidSum: 0,
          owingSum: 0,
        };
        group.count += 1;
        group.priceSum += price;
        group.paidSum += paid;
        group.owingSum += Math.max(0, price - paid);
        out.set(key, group);
      }
    }

    return [...out.values()];
  },

  addLink(
    userId: string,
    projectId: string,
    month: string,
    statusId: string,
    input: { domain: string; domainKey: string },
  ): PlannerLink {
    const stamp = now();
    const row: PlannerLink = {
      id: randomUUID(),
      projectId,
      planMonth: monthStart(month),
      domain: input.domain,
      domainKey: input.domainKey,
      source: '',
      domainRating: null,
      organicTraffic: null,
      organicKeywords: null,
      referringDomains: null,
      metricsSource: null,
      metricsUpdatedAt: null,
      linkType: '',
      targetUrl: null,
      anchorText: '',
      anchorType: '',
      statusId,
      plannedDate: null,
      liveDate: null,
      liveUrl: null,
      priceMinor: null,
      currency: null,
      paymentStatus: 'unpaid',
      paidMinor: null,
      notes: '',
      orderItemId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    store().links.set(row.id, { userId, row });
    return row;
  },

  addLinks(
    userId: string,
    rows: Parameters<typeof import('@/lib/services/planner-service').plannerService.addLinks>[1],
  ): number {
    const db = store();
    for (const input of rows) {
      const stamp = now();
      const row: PlannerLink = {
        id: randomUUID(),
        projectId: input.projectId,
        planMonth: monthStart(input.planMonth),
        domain: input.domain,
        domainKey: input.domainKey,
        source: input.source ?? '',
        domainRating: input.domainRating ?? null,
        organicTraffic: input.organicTraffic ?? null,
        organicKeywords: input.organicKeywords ?? null,
        referringDomains: input.referringDomains ?? null,
        metricsSource:
          input.metricsSource ??
          ([
            input.domainRating ?? null,
            input.organicTraffic ?? null,
            input.organicKeywords ?? null,
            input.referringDomains ?? null,
          ].some((value) => value !== null)
            ? 'csv'
            : null),
        metricsUpdatedAt: null,
        linkType: input.linkType ?? '',
        targetUrl: input.targetUrl ?? null,
        anchorText: input.anchorText ?? '',
        anchorType: input.anchorType ?? '',
        statusId: input.statusId,
        plannedDate: input.plannedDate ?? null,
        liveDate: input.liveDate ?? null,
        liveUrl: input.liveUrl ?? null,
        priceMinor: input.priceMinor ?? null,
        currency: input.currency ?? null,
        paymentStatus: input.paymentStatus ?? 'unpaid',
        paidMinor: input.paidMinor ?? null,
        notes: input.notes ?? '',
        orderItemId: input.orderItemId ?? null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      db.links.set(row.id, { userId, row });
    }
    return rows.length;
  },

  existingDomainKeys(userId: string, projectId: string, month: string): Set<string> {
    return new Set(
      [...store().links.values()]
        .filter(
          (entry) =>
            entry.userId === userId &&
            entry.row.projectId === projectId &&
            entry.row.planMonth === month,
        )
        .map((entry) => entry.row.domainKey),
    );
  },

  updateLink(userId: string, linkId: string, patch: PlannerLinkPatch): PlannerLink | null {
    const entry = store().links.get(linkId);
    if (!entry || entry.userId !== userId) return null;
    Object.assign(entry.row, patch, { updatedAt: now() });
    return entry.row;
  },

  importedOrderItemIds(userId: string): Set<string> {
    return new Set(
      [...store().links.values()]
        .filter((entry) => entry.userId === userId && entry.row.orderItemId)
        .map((entry) => String(entry.row.orderItemId)),
    );
  },

  updateLinks(
    userId: string,
    linkIds: string[],
    patch: {
      statusId?: string;
      source?: string;
      linkType?: string;
      planMonth?: string;
      projectId?: string;
    },
  ): number {
    const db = store();
    let changed = 0;
    for (const id of linkIds) {
      const entry = db.links.get(id);
      if (!entry || entry.userId !== userId) continue;
      db.links.set(id, {
        userId,
        row: {
          ...entry.row,
          ...(patch.statusId !== undefined ? { statusId: patch.statusId } : {}),
          ...(patch.source !== undefined ? { source: patch.source } : {}),
          ...(patch.linkType !== undefined ? { linkType: patch.linkType } : {}),
          ...(patch.planMonth !== undefined ? { planMonth: monthStart(patch.planMonth) } : {}),
          ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
          updatedAt: now(),
        },
      });
      changed += 1;
    }
    return changed;
  },

  deleteLinks(userId: string, linkIds: string[]): number {
    const db = store();
    let removed = 0;
    for (const id of linkIds) {
      const entry = db.links.get(id);
      if (entry && entry.userId === userId) {
        db.links.delete(id);
        removed += 1;
      }
    }
    return removed;
  },
};
