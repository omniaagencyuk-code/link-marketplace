/**
 * The planner's tabs, and how many rows a page of the table holds.
 *
 * Two tabs, not three. The brief's layout puts the overview cards and the
 * link plan on one screen - "Below: Your Link Plan" is literal - so
 * splitting them would be a tab strip the mockup does not have, and a
 * planner whose table is one click away from the landing view is one
 * people click once and leave. Reports is its own tab because it answers a
 * different question and costs a second read of the whole project.
 */
export const PLANNER_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'reports', label: 'Reports' },
] as const;

export type PlannerTab = (typeof PLANNER_TABS)[number]['id'];

export function readTab(value: string | undefined): PlannerTab {
  return PLANNER_TABS.some((tab) => tab.id === value) ? (value as PlannerTab) : 'overview';
}

/**
 * Fifty rows a page.
 *
 * Enough that most months are one page, small enough that the seventeen
 * editable cells in each row do not make the first paint slow. Paging is
 * server-side: the browser never holds a plan it is not showing, which is
 * the brief's rule and also the only version that can be right, since the
 * filter and the sort run in the database.
 */
export const PAGE_SIZE = 50;
