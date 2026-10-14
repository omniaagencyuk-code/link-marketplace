import { PageTitle } from '@/components/dashboard/page-title';
import { EnquiriesTable } from '@/components/admin/enquiries-table';
import { enquiryService } from '@/lib/services/enquiry-service';

export const dynamic = 'force-dynamic';

/**
 * Pricing enquiries.
 *
 * People who used the form on /pricing to ask about bulk, agency or
 * negotiated rates. Separate from the Sales Centre on purpose: a prospect is
 * a company somebody here decided to approach, and this is somebody who
 * wrote to us first. Collapsing the two would mean never being able to say
 * which is which - and would risk an inbound enquirer being swept into an
 * outbound campaign, or their reply blocked by a suppression.
 *
 * The count is read here rather than badged on the sidebar: the badge
 * mechanism is a client-side provider with one figure in it, and plumbing a
 * second through it is more moving parts than a number on the page it
 * describes.
 */
export default async function AdminEnquiriesPage() {
  const waiting = await enquiryService.newCount();

  return (
    <>
      <PageTitle
        title="Pricing enquiries"
        description={
          waiting > 0
            ? `${waiting} waiting to be answered. Everyone here asked us about rates - reply to the address they gave.`
            : 'Requests for bulk, agency or negotiated pricing, from the form on /pricing.'
        }
      />
      <EnquiriesTable />
    </>
  );
}
