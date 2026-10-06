import { SalesTabs } from '@/components/admin/sales-tabs';

/**
 * The Sales Centre's own navigation.
 *
 * Six screens behind one sidebar entry. They are tabs rather than six sidebar
 * rows because the admin sidebar already carries fifteen and this is one area
 * of the product, not six - and because the order here is the order of the
 * work: find them, read what came back, approve what goes out.
 */
export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SalesTabs />
      {children}
    </>
  );
}
