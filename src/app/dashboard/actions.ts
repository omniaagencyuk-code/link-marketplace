'use server';

import { requireCustomerSession } from '@/lib/auth/customer-access';
import { LISTINGS_PER_REQUEST, listingIdsToFetch } from '@/lib/dashboard/listing-batch';
import { websiteService } from '@/lib/services/website-service';
import type { WebsiteListItem } from '@/lib/types';

/**
 * The listings behind a basket or a shortlist.
 *
 * Both live in the browser's local storage, so the page cannot ask for them
 * until it has hydrated. Until now both pages answered that by shipping every
 * active listing and letting the browser find the ones it wanted.
 *
 * Authenticated on its own account rather than trusting the page that calls
 * it: a server action is a POST endpoint, reachable by anyone who can read the
 * page source, and `/api` and server actions alike bypass the proxy in
 * `src/proxy.ts`.
 *
 * What comes back is scoped by row level security, not by this function.
 * `getByIds` reads through `getServerClient()`, which carries the viewer's own
 * cookies, so the policy on `websites` - active listings only, unless you are
 * an admin - decides what a given id resolves to. An id for a draft listing
 * returns nothing, which is why guessing ids buys an attacker nothing here.
 * `publicItems()` strips the cost columns on the way out as it always has.
 */
export async function listingsByIdAction(ids: string[]): Promise<WebsiteListItem[]> {
  await requireCustomerSession();

  const wanted = listingIdsToFetch(ids);
  if (wanted.length === 0) return [];

  /*
    Refused rather than truncated.

    Returning the first hundred of a larger request would be a page quietly
    missing rows - the shortlist renders, nothing errors, and a customer's
    saved sites have silently gone. The caller chunks; a batch bigger than the
    chunk size means the two have drifted, and that is worth an error.
  */
  if (wanted.length > LISTINGS_PER_REQUEST) {
    throw new Error(
      `Asked for ${wanted.length} listings in one request; the limit is ${LISTINGS_PER_REQUEST}.`,
    );
  }

  return websiteService.getByIds(wanted);
}
