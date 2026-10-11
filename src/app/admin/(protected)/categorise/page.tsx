import { PageTitle } from '@/components/dashboard/page-title';
import { CategoriseList } from '@/components/admin/categorise-list';
import { CategoriseSpend } from '@/components/admin/categorise-spend';
import { websiteService } from '@/lib/services';
import { categoryReadService } from '@/lib/services/category-read-service';

export const dynamic = 'force-dynamic';

/**
 * Long enough to read a batch of homepages.
 *
 * A batch is twenty-four sites, fetched eight at a time, each with a twelve
 * second timeout - so three waves, and a worst case near forty seconds
 * before the model has said anything. The platform default is a good deal
 * less than that, and a batch cut off half way is the worst shape this can
 * fail in: some rows read, some not, and nothing saying which.
 *
 * Set at page level because that is what the Next docs say governs a page's
 * Server Actions, and the reads are actions rather than routes. A platform
 * may clamp it to whatever the plan allows; it cannot raise it.
 */
export const maxDuration = 120;

/**
 * The listings nobody has categorised, and what their homepages say.
 *
 * The list comes from the filter 0078 added - `uncategorised: true` against
 * the admin page function - rather than a query of its own, so this screen
 * and the admin table can never disagree about which listings are in this
 * state.
 *
 * One page at a time and one read at a time. The backlog is 1,840 and a run
 * that works through them is the next thing to build; it is deliberately not
 * this, because a run that fetches 1,840 third-party sites and spends tokens
 * on all of them before anybody has judged a single answer is the wrong
 * order to find out the rules are wrong.
 */
export default async function AdminCategorisePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const asked = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(asked ?? '1') || 1);
  const pageSize = 25;

  const { items, total } = await websiteService.adminPage(
    { search: '', status: 'active', uncategorised: true },
    page,
    pageSize,
  );
  /*
    Both after the page, because the spend line needs the backlog total to
    say what the rest would cost - and both at once, because neither needs
    the other. Two serial round trips to London is 70ms of nothing.
  */
  const [reads, spend] = await Promise.all([
    categoryReadService.readsFor(items.map((item) => item.id)),
    categoryReadService.spend(total),
  ]);

  return (
    <>
      <PageTitle
        title="Categorise"
        description="Active listings with no category. Read the homepage to get a proposal, then accept it or leave it - nothing is applied until you do."
      />
      <CategoriseSpend spend={spend} />
      <CategoriseList
        websites={items.map((item) => ({
          id: item.id,
          slug: item.slug,
          domain: item.domain,
          title: item.title,
        }))}
        reads={reads}
        total={total}
        page={page}
        pageSize={pageSize}
      />
    </>
  );
}
