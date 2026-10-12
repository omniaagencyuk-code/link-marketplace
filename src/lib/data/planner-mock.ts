import { randomUUID } from 'node:crypto';
import { monthStart } from '@/lib/planner/domain-key';
import { STATUS_CATEGORIES } from '@/lib/types/planner';
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

  links(
    userId: string,
    projectId: string,
    month: string,
    page: number,
    pageSize: number,
  ): { items: PlannerLink[]; total: number } {
    const all = [...store().links.values()]
      .filter(
        (entry) =>
          entry.userId === userId &&
          entry.row.projectId === projectId &&
          entry.row.planMonth === month,
      )
      .map((entry) => entry.row)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    const from = (page - 1) * pageSize;
    return { items: all.slice(from, from + pageSize), total: all.length };
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

  monthSummaryRows(userId: string, projectId: string, month: string) {
    return [...store().links.values()]
      .filter(
        (entry) =>
          entry.userId === userId &&
          entry.row.projectId === projectId &&
          entry.row.planMonth === month,
      )
      .map((entry) => ({
        statusId: entry.row.statusId,
        linkType: entry.row.linkType,
        anchorType: entry.row.anchorType,
        priceMinor: entry.row.priceMinor,
        currency: entry.row.currency,
        paymentStatus: entry.row.paymentStatus,
        paidMinor: entry.row.paidMinor,
      }));
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
        source: input.source,
        domainRating: input.domainRating,
        organicTraffic: input.organicTraffic,
        organicKeywords: input.organicKeywords,
        referringDomains: input.referringDomains,
        metricsSource:
          input.domainRating !== null ||
          input.organicTraffic !== null ||
          input.organicKeywords !== null ||
          input.referringDomains !== null
            ? 'csv'
            : null,
        metricsUpdatedAt: null,
        linkType: input.linkType,
        targetUrl: input.targetUrl,
        anchorText: input.anchorText,
        anchorType: input.anchorType,
        statusId: input.statusId,
        plannedDate: input.plannedDate,
        liveDate: input.liveDate,
        liveUrl: input.liveUrl,
        priceMinor: input.priceMinor,
        currency: input.currency,
        paymentStatus: 'unpaid',
        paidMinor: null,
        notes: input.notes,
        orderItemId: null,
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
