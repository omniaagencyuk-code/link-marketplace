import { PageTitle } from '@/components/dashboard/page-title';
import { AdminOrdersTable } from '@/components/admin/admin-orders-table';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  /*
    Nothing read here.

    This used to read every order - with every item and every issue joined
    on - and hand all of them to the table. The table asks the database for
    one page now, which is also the only way the count above it can be the
    real one: the read this replaced was capped at a thousand rows and said
    nothing about it.
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
