import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { PlannerView } from '@/components/planner/planner-view';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { plannerService } from '@/lib/services/planner-service';
import { plannerMetrics } from '@/lib/services/planner-metrics';
import { monthStart } from '@/lib/planner/domain-key';
import { summariseMonth } from '@/lib/planner/summary';
import { readFilter, readSort } from '@/lib/planner/filter';

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

  /*
    Statuses are fetched even with no project, because the empty state is
    followed immediately by creating one, and seeding the defaults on this
    read means the first row a customer adds already has a status to wear.
  */
  const statuses = await plannerService.statuses(user.id);

  const [sources, monthSettings, page, summaryRows] = await Promise.all([
    plannerService.sources(user.id),
    project && month
      ? plannerService.monthSettings(user.id, project, month)
      : Promise.resolve(null),
    project
      ? plannerService.links(user.id, {
          projectId: project.id,
          month,
          page: 1,
          pageSize: 50,
          filter,
          sort,
        })
      : Promise.resolve({ items: [], total: 0 }),
    /* The whole month, but only the seven columns the cards add up. The
       table is paged at fifty; the summary counts all of them, and reading
       every column of every row to total four of them is the shape this
       codebase keeps undoing. */
    project
      ? plannerService.monthSummaryRows(user.id, project.id, month)
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
    ? summariseMonth(summaryRows, statuses, {
        target: monthSettings?.linkTarget ?? null,
        budgetMinor: monthSettings?.budgetMinor ?? null,
        currency: project.currency,
      })
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
      />
    </>
  );
}
