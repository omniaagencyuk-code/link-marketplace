import { redirect } from 'next/navigation';

/**
 * The rate card list grew into the no-draft list.
 *
 * Kept as a redirect rather than deleted: the old address was live, it is in
 * somebody's history, and a 404 on an admin page reads as the feature having
 * been taken away.
 */
export default function RateCardsPage() {
  redirect('/admin/sourcing/no-drafts');
}
