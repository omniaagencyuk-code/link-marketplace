import { PageTitle } from '@/components/dashboard/page-title';
import { PublisherOffersTable } from '@/components/admin/publisher-offers-table';
import { publisherSubmissionService } from '@/lib/services/publisher-submission-service';

export const dynamic = 'force-dynamic';

/**
 * Offers of a site, from the form on /list-your-site.
 *
 * Beside the publisher inbox rather than inside it, and the distinction is
 * the same one /admin/enquiries draws against the Sales Centre: the inbox
 * holds emails a model read and turned into drafts, carrying a prompt
 * version so a rule that turns out to be wrong can be found again. These
 * were typed by the publisher and read by nobody. Collapsing them would mean
 * never being able to say which is which - and `listing_drafts.email_id` is
 * not null, so it could not be done without inventing an email that never
 * arrived.
 *
 * The count is read here rather than badged on the sidebar: the badge
 * mechanism is a client-side provider with one figure in it, and plumbing a
 * second through it is more moving parts than a number on the page it
 * describes.
 */
export default async function AdminPublisherOffersPage() {
  const waiting = await publisherSubmissionService.newCount();

  return (
    <>
      <PageTitle
        title="Publisher offers"
        description={
          waiting > 0
            ? `${waiting} waiting to be looked at. Each one is somebody offering us a site - reply to the address they gave.`
            : 'Sites publishers have offered us through the form on /list-your-site.'
        }
      />
      <PublisherOffersTable />
    </>
  );
}
