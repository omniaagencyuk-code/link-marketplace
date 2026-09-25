'use server';

import { revalidatePath } from 'next/cache';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { deliveryService } from '@/lib/services/delivery-service';

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
