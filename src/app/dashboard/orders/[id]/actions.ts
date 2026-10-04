'use server';

import { revalidatePath } from 'next/cache';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { deliveryService } from '@/lib/services/delivery-service';
import { requestRefund, requestReplacement } from '@/lib/services/link-monitor-service';

/**
 * What a customer may do to their own delivered placements.
 *
 * The user id comes from the session on the server, never from the form. A
 * form field saying whose order this is would be a field anybody can change,
 * and the whole guarantee here is that an item id alone gets you nowhere.
 */

export async function approveItemsAction(itemIds: string[]) {
  const user = await requireCustomerSession();
  const { approved } = await deliveryService.approve(itemIds, user.id);

  revalidatePath('/dashboard/orders');
  return { approved };
}

export async function reportIssueAction(itemId: string, message: string) {
  const user = await requireCustomerSession();
  const result = await deliveryService.raiseIssue(itemId, user.id, message);

  revalidatePath('/dashboard/orders');
  return result;
}

/**
 * The buyer's choice when a guarantee claim runs out of publisher time.
 *
 * The claim id comes from the page, the user id from the session. The service
 * proves the claim is theirs and still open before it writes either way - a
 * claim id is a uuid on a page, and knowing one must not be enough to order a
 * free placement or a refund against somebody else's order.
 */
export async function requestReplacementAction(claimId: string) {
  const user = await requireCustomerSession();
  const result = await requestReplacement(claimId, user.id);

  revalidatePath('/dashboard/orders');
  return result;
}

export async function requestRefundAction(claimId: string) {
  const user = await requireCustomerSession();
  const result = await requestRefund(claimId, user.id);

  revalidatePath('/dashboard/orders');
  return result;
}
