import { PageTitle } from '@/components/dashboard/page-title';
import { AdminOrdersTable } from '@/components/admin/admin-orders-table';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  /*
    Nothing read here.

    This used to read every order - with every item and every issue joined
    on - and hand all of them to the table, in one request with no range and
    with its error discarded. The table asks the database for one page now.

    What that read would have done is cap at a thousand rows without saying
    so. It had not: there are 2 orders. The claim that it was already
    hiding the oldest came from a figure invented in a comment on the users
    page and then believed, which is the mistake this note exists to stop
    somebody repeating. The discarded error was real at any size, and the
    paging is right whenever the customer side does launch.
  */
  return (
    <>
      <PageTitle
        title="Orders"
        description="Every order across the marketplace. Change a status to move an order through fulfilment."
      />
      <AdminOrdersTable />
    </>
  );
}
