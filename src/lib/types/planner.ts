/**
 * The Link Building Planner's shapes.
 *
 * A planner link is a spreadsheet row, and the types say so: almost every
 * field is optional, because a customer adds a domain first and fills the
 * rest in over weeks. The two that are not optional are the ones a row is
 * meaningless without - which project it belongs to and which month it is
 * planned for.
 *
 * ## Why so many `| null`
 *
 * Because blank is not zero and the type system is where that rule either
 * holds or quietly stops holding. A `domainRating: number` with a default of
 * 0 compiles, renders, and reports a portfolio average that falls every time
 * somebody adds a row they have not researched. `number | null` makes the
 * unknown case something every caller has to look at.
 */

/** What a status means to the dashboard, whatever the customer called it. */
export const STATUS_CATEGORIES = [
  'planned',
  'in_progress',
  'scheduled',
  'waiting',
  'live',
  'lost',
  'cancelled',
] as const;

export type StatusCategory = (typeof STATUS_CATEGORIES)[number];

export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
  waiting: 'Waiting to go live',
  live: 'Live',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export interface PlannerStatus {
  id: string;
  name: string;
  /** `#rrggbb`, validated by the database. */
  colour: string;
  category: StatusCategory;
  sortOrder: number;
  /** Set when retired. Keeps describing the links that already carry it. */
  archivedAt: string | null;
}

/**
 * Where a link came from.
 *
 * The five defaults are the application's, not rows: they are the same for
 * everybody, and a row per user per default is thousands of rows saying
 * nothing. A customer's own additions are rows.
 */
export const DEFAULT_SOURCES = [
  'Press Parrot',
  'Other Marketplace',
  'Direct Publisher',
  'Outreach',
  'Manual',
] as const;

/** The placement shapes the planner offers before a customer adds their own. */
export const DEFAULT_LINK_TYPES = [
  'Guest Post',
  'Link Insertion',
  'Homepage Link',
  'Digital PR',
  'Sponsored Post',
  'Other',
] as const;

export const ANCHOR_TYPES = [
  'Branded',
  'Exact Match',
  'Partial Match',
  'Generic',
  'Naked URL',
  'Image',
  'Other',
] as const;

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid';

/** How the four metrics on a row got there. Never a claim that they are true. */
export type MetricsSource = 'manual' | 'csv' | 'press-parrot';

export interface PlannerLink {
  id: string;
  projectId: string;
  /** First of the month it is planned into. Not where it ended up. */
  planMonth: string;

  /** As the customer typed it. */
  domain: string;
  /** And normalised, which is what matching uses. */
  domainKey: string;

  source: string;

  domainRating: number | null;
  organicTraffic: number | null;
  organicKeywords: number | null;
  referringDomains: number | null;
  metricsSource: MetricsSource | null;
  metricsUpdatedAt: string | null;

  linkType: string;
  targetUrl: string | null;
  anchorText: string;
  anchorType: string;

  statusId: string;

  plannedDate: string | null;
  liveDate: string | null;
  liveUrl: string | null;

  priceMinor: number | null;
  currency: string | null;
  paymentStatus: PaymentStatus;
  paidMinor: number | null;

  notes: string;
  orderItemId: string | null;

  createdAt: string;
  updatedAt: string;
}

/** A project, as the planner uses it. The row is `gap_projects`. */
export interface PlannerProject {
  id: string;
  name: string;
  domain: string;
  country: string;
  currency: string;
  monthlyBudgetMinor: number | null;
  monthlyLinkTarget: number | null;
  notes: string;
  archivedAt: string | null;
}

/** A month's override of the project's defaults, when it has one. */
export interface PlannerMonth {
  projectId: string;
  month: string;
  budgetMinor: number | null;
  linkTarget: number | null;
}

/** What a month is actually running on, defaults filled in. */
export interface MonthSettings {
  month: string;
  budgetMinor: number | null;
  linkTarget: number | null;
  /** True when these came from the project rather than from an override. */
  fromProjectDefaults: boolean;
}

/** The fields the table may write. Deliberately not every column. */
export type PlannerLinkPatch = Partial<
  Pick<
    PlannerLink,
    | 'planMonth'
    | 'domain'
    | 'domainKey'
    | 'source'
    | 'domainRating'
    | 'organicTraffic'
    | 'organicKeywords'
    | 'referringDomains'
    | 'metricsSource'
    | 'metricsUpdatedAt'
    | 'linkType'
    | 'targetUrl'
    | 'anchorText'
    | 'anchorType'
    | 'statusId'
    | 'plannedDate'
    | 'liveDate'
    | 'liveUrl'
    | 'priceMinor'
    | 'currency'
    | 'paymentStatus'
    | 'paidMinor'
    | 'notes'
    | 'projectId'
  >
>;
