import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { PlannerView } from '@/components/planner/planner-view';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { plannerService } from '@/lib/services/planner-service';
import { plannerMetrics } from '@/lib/services/planner-metrics';
import { monthStart } from '@/lib/planner/domain-key';
import { summariseMonth } from '@/lib/planner/summary';
import { buildReport } from '@/lib/planner/reports';
import { readFilter, readSort } from '@/lib/planner/filter';
import { PLANNER_TABS, readTab, PAGE_SIZE } from '@/lib/planner/tabs';

export const metadata: Metadata = { title: 'Link Building Planner' };

/**
 * The planner.
 *
 * Dynamic because every figure on it belongs to one account; a cached copy
 * is a copy of somebody's supplier prices served to whoever asks next.
 */
export const dynamic = 'force-dynamic';

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireCustomerSession('/dashboard/planner');
  const params = await searchParams;

  const one = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  /*
    The project and the month live in the URL, so a plan can be bookmarked
    and the back button works between months - which is the navigation
    somebody uses most here.
  */
  const projects = await plannerService.projects(user.id);
  const asked = one('project');
  const project = projects.find((candidate) => candidate.id === asked) ?? projects[0] ?? null;

  /*
    `month=all` is the whole project rather than no month. It is what makes
    a planned-date range mean anything - a range inside one month is a
    range of at most thirty-one days - and it is what the add box and the
    month figures are hidden for, because neither has a month to write to.
  */
  const asked_month = one('month') ?? new Date().toISOString();
  const month = asked_month === 'all' ? null : monthStart(asked_month);

  const filter = readFilter(one);
  const sort = readSort(one);
  const tab = readTab(one('tab'));

  /*
    The page number is in the URL like everything else, so the fourth page
    of a filtered month is a link. Clamped to 1 rather than trusted: a
    negative page would be a negative `range` offset, which PostgREST
    answers with an error nobody can act on.
  */
  const pageNumber = Math.max(1, Math.min(Math.round(Number(one('p') ?? 1)) || 1, 10_000));

  /*
    Statuses are fetched even with no project, because the empty state is
    followed immediately by creating one, and seeding the defaults on this
    read means the first row a customer adds already has a status to wear.
  */
  const statuses = await plannerService.statuses(user.id);

  const [sources, monthSettings, page, scopeGroups, projectGroups] = await Promise.all([
    plannerService.sources(user.id),
    project && month
      ? plannerService.monthSettings(user.id, project, month)
      : Promise.resolve(null),
    project
      ? plannerService.links(user.id, {
          projectId: project.id,
          month,
          page: pageNumber,
          pageSize: PAGE_SIZE,
          filter,
          sort,
        })
      : Promise.resolve({ items: [], total: 0 }),
    /* The scope, counted by the database rather than read and added up
       here. One row per combination that exists, so a thousand-link month
       is a few dozen rows and there is no PostgREST cap to fall past. */
    project ? plannerService.groups(user.id, project.id, month) : Promise.resolve([]),
    /* And the whole project, for the Reports tab. Fetched only when that
       tab is open: it is the same shape but across every month, and a
       round trip nobody is looking at is a round trip. */
    project && tab === 'reports'
      ? plannerService.groups(user.id, project.id, null)
      : Promise.resolve([]),
  ]);

  /*
    Which of the domains on this page the marketplace sells, so the table
    can say so and link to the listing. Two columns for the fifty rows
    already on screen, and only for domains the customer typed themselves:
    it tells them nothing the marketplace's own search box would not, which
    is why it is not behind the lookup limit. See `listingSlugs`.
  */
  const listings = Object.fromEntries(
    await plannerMetrics.listingSlugs(page.items.map((link) => link.domainKey)),
  );

  /*
    The cards count the scope, not the filter: they describe the plan, and a
    filter is how somebody finds a row in it. The table's own count says
    how many the filter matched, so the two numbers never pretend to be the
    same one.

    Across the whole project there is no single target or budget to measure
    against, so both are null - and `summariseMonth` reports no progress
    rather than progress against nothing.
  */
  const summary = project
    ? summariseMonth(scopeGroups, {
        target: monthSettings?.linkTarget ?? null,
        budgetMinor: monthSettings?.budgetMinor ?? null,
        currency: project.currency,
      })
    : null;

  const report =
    project && tab === 'reports'
      ? buildReport(projectGroups, statuses, project.currency)
      : null;

  return (
    <>
      <PageTitle
        title="Link Building Planner"
        description="Plan, organise and track your link building campaigns. Free to use."
      />
      <PlannerView
        projects={projects}
        project={project}
        month={month}
        monthSettings={monthSettings}
        filter={filter}
        sort={sort}
        links={page.items}
        total={page.total}
        statuses={statuses}
        sources={sources}
        summary={summary}
        listings={listings}
        tab={tab}
        tabs={PLANNER_TABS}
        report={report}
        page={pageNumber}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}
