import type { Metadata } from 'next';
import { PageTitle } from '@/components/dashboard/page-title';
import { PlannerView } from '@/components/planner/planner-view';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { plannerService } from '@/lib/services/planner-service';
import { monthStart } from '@/lib/planner/domain-key';

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

  const month = monthStart(one('month') ?? new Date().toISOString());

  /*
    Statuses are fetched even with no project, because the empty state is
    followed immediately by creating one, and seeding the defaults on this
    read means the first row a customer adds already has a status to wear.
  */
  const statuses = await plannerService.statuses(user.id);

  const [sources, monthSettings, page] = await Promise.all([
    plannerService.sources(user.id),
    project
      ? plannerService.monthSettings(user.id, project, month)
      : Promise.resolve(null),
    project
      ? plannerService.links(user.id, project.id, month, 1, 50)
      : Promise.resolve({ items: [], total: 0 }),
  ]);

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
        links={page.items}
        total={page.total}
        statuses={statuses}
        sources={sources}
      />
    </>
  );
}
