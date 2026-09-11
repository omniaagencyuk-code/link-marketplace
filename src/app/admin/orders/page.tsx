import { PageTitle } from '@/components/dashboard/page-title';
import { AdminOrdersTable } from '@/components/admin/admin-orders-table';
import { orderService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage() {
  const orders = await orderService.getAll();

  return (
    <>
      <PageTitle
        title="Orders"
        description="Every order across the marketplace. Change a status to move an order through fulfilment."
      />
      <AdminOrdersTable orders={orders} />
    </>
  );
}
