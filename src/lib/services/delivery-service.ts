import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { settingsService } from './settings-service';
import { mockStore } from './mock-store';
import { emailService } from './email-service';
import { emailToAdmin } from '@/lib/email/config';
import {
  approvalReminder,
  issueRaised,
  issueResolved,
  placementDelivered,
  type BrandBits,
} from '@/lib/email/templates';
import { siteUrl } from '@/lib/config/brand';
import type { Order } from '@/lib/types';
import {
  autoApproveDate,
  canApprove,
  canReportIssue,
  daysUntilAutoApproval,
  dueForAutoApproval,
  dueForReminder,
  orderIsComplete,
  type DeliverableItem,
} from '@/lib/orders/delivery';

/**
 * Handing a placement back, and what the customer does about it.
 *
 * Everything here runs on the service-role client, so every function has to
 * do its own authorisation - the database is not going to do it for us. The
 * rule is the same in all of them and is not negotiable: a customer action
 * takes a user id and proves the item belongs to that user's order before it
 * writes anything. An item id is a uuid that appears in a page, and knowing
 * one must never be enough to approve somebody else's placement or read
 * their complaint.
 *
 * The service role is used rather than the customer's own client because
 * approving an item has to update the order alongside it, and an order is
 * not a row a customer may write.
 */

export interface DeliverResult {
  ok: boolean;
  error?: string;
}

/**
 * The same store the order service uses, keyed by name.
 *
 * Without a database the whole review flow would otherwise be buttons that do
 * nothing, which is a poor way to find out whether the flow makes sense. The
 * ownership rule is enforced here too, not skipped: a mock that is laxer than
 * production is a mock that hides the bug production will have.
 */
const mockOrders = () => mockStore<Order>('orders');

/** Apply a change to one item of one order, in memory. */
function mockUpdate(
  itemId: string,
  userId: string | null,
  change: (item: Order['items'][number], order: Order) => Order['items'][number] | null,
): Order | null {
  const store = mockOrders();
  for (const order of store.values()) {
    if (userId !== null && order.userId !== userId) continue;
    const index = order.items.findIndex((item) => item.id === itemId);
    if (index === -1) continue;

    const updated = change(order.items[index]!, order);
    if (!updated) return null;

    const items = [...order.items];
    items[index] = updated;
    const next: Order = { ...order, items, updatedAt: new Date().toISOString() };
    next.completedAt = orderIsComplete(items) ? (next.completedAt ?? new Date().toISOString()) : undefined;
    store.set(order.id, next);
    return next;
  }
  return null;
}

/** The columns every ownership check needs, and nothing more. */
const OWNERSHIP_SELECT =
  'id, order_id, delivered_at, approval, approved_at, auto_approve_at, orders!inner (id, user_id)';

interface OwnedItem extends DeliverableItem {
  id: string;
  orderId: string;
}

/**
 * The item, but only if it really is theirs.
 *
 * Returns null for "no such item" and for "not yours" alike. The caller must
 * not tell the two apart either: a different message for an item that exists
 * turns this into a way of discovering other people's order ids.
 */
async function ownedItem(itemId: string, userId: string): Promise<OwnedItem | null> {
  const supabase = getAdminScopedClient();
  const { data } = await supabase
    .from('order_items')
    .select(OWNERSHIP_SELECT)
    .eq('id', itemId)
    .maybeSingle();

  if (!data) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const row = data as any;
  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!order || order.user_id !== userId) return null;

  return {
    id: row.id,
    orderId: row.order_id,
    deliveredAt: row.delivered_at ?? undefined,
    approval: row.approval ?? 'pending',
    approvedAt: row.approved_at ?? undefined,
    autoApproveAt: row.auto_approve_at ?? undefined,
  };
}

/**
 * Close the order if nothing on it is outstanding.
 *
 * Read back rather than reasoned about: several items can be approved in the
 * same breath, and deciding from the copy we had before the write would close
 * an order with a line still open, or fail to close one that is finished.
 */
async function closeOrderIfDone(orderId: string): Promise<void> {
  const supabase = getAdminScopedClient();
  const { data } = await supabase.from('order_items').select('approval').eq('order_id', orderId);

  const items = ((data ?? []) as { approval: string | null }[]).map((row) => ({
    approval: (row.approval ?? 'pending') as DeliverableItem['approval'],
  }));

  if (!orderIsComplete(items)) return;

  await supabase
    .from('orders')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', orderId)
    // Only the first time. An order that completes twice would move its own
    // completion date every time a customer reopened and re-approved a line.
    .is('completed_at', null);
}

/** An order that is no longer finished, because a line was reopened. */
async function reopenOrder(orderId: string): Promise<void> {
  const supabase = getAdminScopedClient();
  await supabase.from('orders').update({ completed_at: null }).eq('id', orderId);
}

/**
 * Everything an email about a placement needs to say.
 *
 * One query rather than four, and read after the write rather than before:
 * the message has to describe what actually happened, not what we were about
 * to attempt.
 */
interface ItemContext {
  itemId: string;
  orderId: string;
  orderReference: string;
  customerEmail: string;
  customerName: string;
  domain: string;
  liveUrl?: string;
  autoApproveAt?: string;
}

async function itemContext(itemId: string): Promise<ItemContext | null> {
  if (!isSupabaseEnabled()) return null;

  const { data } = await getAdminScopedClient()
    .from('order_items')
    .select(
      'id, order_id, website_domain, live_url, auto_approve_at, orders!inner (id, reference, customer_email, customer_name)',
    )
    .eq('id', itemId)
    .maybeSingle();

  if (!data) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const row = data as any;
  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  if (!order) return null;

  return {
    itemId: row.id,
    orderId: row.order_id,
    orderReference: order.reference ?? '',
    customerEmail: order.customer_email ?? '',
    customerName: order.customer_name ?? '',
    domain: row.website_domain ?? '',
    liveUrl: row.live_url ?? undefined,
    autoApproveAt: row.auto_approve_at ?? undefined,
  };
}

async function brandBits(): Promise<BrandBits> {
  const settings = await settingsService.get();
  return {
    brandName: settings.brandName,
    supportEmail: settings.supportEmail,
    siteUrl,
  };
}

export const deliveryService = {
  /**
   * Hand a finished placement to the customer.
   *
   * Admin only, and deliberately explicit: recording a live URL and telling
   * the customer to go and look at it are the same action here, because a URL
   * saved quietly is one nobody is ever told about. The review deadline is
   * fixed now and stored, so changing the setting later never moves a date
   * somebody has already been shown.
   */
  async deliver(itemId: string, liveUrl: string, deliveredBy?: string): Promise<DeliverResult> {
    const url = liveUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      return { ok: false, error: 'That does not look like a URL. It needs to start with https://' };
    }

    const settings = await settingsService.get();
    const now = new Date();

    if (!isSupabaseEnabled()) {
      // No user id: delivering is ours to do, not a customer's.
      const done = mockUpdate(itemId, null, (item) => ({
        ...item,
        liveUrl: url,
        status: 'live',
        deliveredAt: now.toISOString(),
        autoApproveAt: autoApproveDate(now, settings.deliveryAutoApproveDays).toISOString(),
        approval: 'pending',
        approvedAt: undefined,
        autoApproved: false,
      }));
      return done ? { ok: true } : { ok: false, error: 'No such placement.' };
    }

    const supabase = getAdminScopedClient();

    const { error } = await supabase
      .from('order_items')
      .update({
        live_url: url,
        status: 'live',
        delivered_at: now.toISOString(),
        auto_approve_at: autoApproveDate(now, settings.deliveryAutoApproveDays).toISOString(),
        // Redelivering after a complaint puts the item back in front of the
        // customer rather than leaving it marked as disputed forever.
        approval: 'pending',
        approved_at: null,
        auto_approved: false,
      })
      .eq('id', itemId);

    if (error) return { ok: false, error: `Could not save the delivery: ${error.message}` };

    // A redelivery on a completed order reopens it: it is not finished again
    // until the customer says so a second time.
    const { data } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('id', itemId)
      .maybeSingle();
    if (data) await reopenOrder((data as { order_id: string }).order_id);

    // After the write, never before: the email says the placement is live, so
    // it must not go out unless it is. A failure to send is logged and does
    // not undo the delivery - the customer can still see it by logging in.
    const context = await itemContext(itemId);
    if (context?.customerEmail && context.liveUrl) {
      const brand = await brandBits();
      await emailService.send({
        ...placementDelivered(
          {
            domain: context.domain,
            liveUrl: context.liveUrl,
            orderReference: context.orderReference,
            orderId: context.orderId,
            autoApproveAt: context.autoApproveAt,
          },
          brand,
        ),
        to: context.customerEmail,
        template: 'placement-delivered',
        orderId: context.orderId,
        orderItemId: itemId,
      });
    }

    void deliveredBy;
    return { ok: true };
  },

  /**
   * The customer accepts one or more placements.
   *
   * Takes a list because approving twelve articles one at a time is the kind
   * of chore that makes people stop looking properly. Each is still checked
   * on its own: a list containing one item that is not theirs approves the
   * rest and silently skips that one, rather than failing the lot or - far
   * worse - approving it.
   */
  async approve(itemIds: string[], userId: string): Promise<{ approved: number }> {
    if (itemIds.length === 0) return { approved: 0 };

    if (!isSupabaseEnabled()) {
      const at = new Date().toISOString();
      let count = 0;
      for (const itemId of itemIds) {
        const done = mockUpdate(itemId, userId, (item) =>
          canApprove(item)
            ? {
                ...item,
                approval: 'approved',
                approvedAt: at,
                autoApproved: false,
                issues: (item.issues ?? []).map((issue) =>
                  issue.resolvedAt
                    ? issue
                    : { ...issue, resolvedAt: at, resolutionNote: 'Closed when the customer approved.' },
                ),
              }
            : null,
        );
        if (done) count += 1;
      }
      return { approved: count };
    }

    const supabase = getAdminScopedClient();
    const now = new Date().toISOString();
    const orderIds = new Set<string>();
    let approved = 0;

    for (const itemId of itemIds) {
      const item = await ownedItem(itemId, userId);
      if (!item || !canApprove(item)) continue;

      const { error } = await supabase
        .from('order_items')
        .update({
          approval: 'approved',
          approved_at: now,
          // They pressed the button. That is the fact worth keeping.
          auto_approved: false,
        })
        .eq('id', itemId);

      if (error) continue;

      // Approving settles whatever they complained about. The thread stays,
      // because what went wrong is worth knowing next time we use that
      // publisher.
      await supabase
        .from('order_item_issues')
        .update({ resolved_at: now, resolution_note: 'Closed when the customer approved.' })
        .eq('order_item_id', itemId)
        .is('resolved_at', null);

      orderIds.add(item.orderId);
      approved += 1;
    }

    for (const orderId of orderIds) await closeOrderIfDone(orderId);
    return { approved };
  },

  /**
   * The customer says something is wrong.
   *
   * Their words go in untouched. A complaint we have paraphrased into a
   * status is a complaint nobody can act on, and the message is the only part
   * of this that tells us what to ask the publisher for.
   */
  async raiseIssue(
    itemId: string,
    userId: string,
    message: string,
  ): Promise<DeliverResult> {
    const text = message.trim();
    if (!text) return { ok: false, error: 'Tell us what is wrong so we can fix it.' };
    if (text.length > 2000) {
      return { ok: false, error: 'That is longer than we can store. Please shorten it a little.' };
    }

    const settings = await settingsService.get();
    const now = new Date();

    if (!isSupabaseEnabled()) {
      const done = mockUpdate(itemId, userId, (item) =>
        canReportIssue(item, settings.postApprovalIssueDays, now)
          ? {
              ...item,
              approval: 'issue-raised',
              issues: [
                {
                  id: `${itemId}_issue_${(item.issues?.length ?? 0) + 1}`,
                  orderItemId: itemId,
                  message: text,
                  createdAt: now.toISOString(),
                },
                ...(item.issues ?? []),
              ],
            }
          : null,
      );
      return done ? { ok: true } : { ok: false, error: 'This placement is not open for a report.' };
    }

    const item = await ownedItem(itemId, userId);
    // The same refusal for an item that is not theirs and one that is out of
    // time. Neither is a hint worth giving.
    if (!item || !canReportIssue(item, settings.postApprovalIssueDays, now)) {
      return { ok: false, error: 'This placement is not open for a report.' };
    }

    const supabase = getAdminScopedClient();
    const { error } = await supabase
      .from('order_item_issues')
      .insert({ order_item_id: itemId, raised_by: userId, message: text });

    if (error) return { ok: false, error: `Could not save that: ${error.message}` };

    // An approved placement that has gone wrong goes back to being open, and
    // the order with it.
    await supabase.from('order_items').update({ approval: 'issue-raised' }).eq('id', itemId);
    await reopenOrder(item.orderId);

    // To us, not to them. Without this a complaint sits in the admin until
    // somebody happens to look, which on a quiet week is days.
    const context = await itemContext(itemId);
    if (context) {
      const brand = await brandBits();
      await emailService.send({
        ...issueRaised(
          {
            domain: context.domain,
            customerName: context.customerName,
            customerEmail: context.customerEmail,
            orderReference: context.orderReference,
            orderId: context.orderId,
            message: text,
          },
          brand,
        ),
        to: emailToAdmin(brand.supportEmail),
        // So hitting reply answers the customer rather than ourselves.
        replyTo: context.customerEmail || undefined,
        template: 'issue-raised',
        orderId: context.orderId,
        orderItemId: itemId,
      });
    }

    return { ok: true };
  },

  /** What we did about it. Admin only; shown back to the customer. */
  async resolveIssue(issueId: string, note: string, resolvedBy?: string): Promise<DeliverResult> {
    if (!isSupabaseEnabled()) return { ok: false, error: 'The database is not connected.' };

    const supabase = getAdminScopedClient();
    const { data: issue } = await supabase
      .from('order_item_issues')
      .select('order_item_id')
      .eq('id', issueId)
      .maybeSingle();

    const { error } = await supabase
      .from('order_item_issues')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy ?? null,
        resolution_note: note.trim() || null,
      })
      .eq('id', issueId);

    if (error) return { ok: false, error: error.message };

    const itemId = (issue as { order_item_id: string } | null)?.order_item_id;
    const context = itemId ? await itemContext(itemId) : null;
    if (context?.customerEmail) {
      const brand = await brandBits();
      await emailService.send({
        ...issueResolved(
          {
            domain: context.domain,
            orderReference: context.orderReference,
            orderId: context.orderId,
            note: note.trim(),
          },
          brand,
        ),
        to: context.customerEmail,
        template: 'issue-resolved',
        orderId: context.orderId,
        orderItemId: context.itemId,
      });
    }

    return { ok: true };
  },

  /** Every open complaint, newest first. The admin's queue. */
  async openIssues(): Promise<
    {
      id: string;
      message: string;
      createdAt: string;
      orderId: string;
      orderReference: string;
      itemId: string;
      websiteDomain: string;
      liveUrl?: string;
    }[]
  > {
    if (!isSupabaseEnabled()) return [];

    const supabase = getAdminScopedClient();
    const { data } = await supabase
      .from('order_item_issues')
      .select(
        'id, message, created_at, order_item_id, order_items!inner (id, website_domain, live_url, order_id, orders!inner (id, reference))',
      )
      .is('resolved_at', null)
      .order('created_at', { ascending: false });

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return ((data ?? []) as any[]).map((row) => {
      const item = Array.isArray(row.order_items) ? row.order_items[0] : row.order_items;
      const order = Array.isArray(item?.orders) ? item.orders[0] : item?.orders;
      return {
        id: row.id as string,
        message: row.message as string,
        createdAt: row.created_at as string,
        orderId: (order?.id as string) ?? '',
        orderReference: (order?.reference as string) ?? '',
        itemId: (item?.id as string) ?? '',
        websiteDomain: (item?.website_domain as string) ?? '',
        liveUrl: (item?.live_url as string) ?? undefined,
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  },

  /**
   * Warn whoever is about to run out of time.
   *
   * Marked as reminded before the send rather than after, so a provider
   * timeout cannot turn into the same customer being warned every day until
   * somebody notices. The idempotency key covers the other direction: a job
   * run twice in a day is one email, not two.
   */
  async sendApprovalReminders(): Promise<{ reminded: number }> {
    if (!isSupabaseEnabled()) return { reminded: 0 };

    const supabase = getAdminScopedClient();
    const settings = await settingsService.get();
    const now = new Date();

    const { data } = await supabase
      .from('order_items')
      .select(
        'id, order_id, delivered_at, approval, auto_approve_at, reminder_sent_at, website_domain, orders!inner (id, reference, customer_email)',
      )
      .eq('approval', 'pending')
      .not('delivered_at', 'is', null)
      .is('reminder_sent_at', null);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = ((data ?? []) as any[]).map((row) => {
      const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
      return {
        id: row.id as string,
        orderId: row.order_id as string,
        deliveredAt: row.delivered_at ?? undefined,
        approval: (row.approval ?? 'pending') as DeliverableItem['approval'],
        autoApproveAt: row.auto_approve_at ?? undefined,
        reminderSentAt: row.reminder_sent_at ?? undefined,
        domain: (row.website_domain as string) ?? '',
        orderReference: (order?.reference as string) ?? '',
        customerEmail: (order?.customer_email as string) ?? '',
      };
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // The rule lives in one place and is tested there, so the query narrows
    // and this decides.
    const due = dueForReminder(rows, settings.approvalReminderDays, now);
    if (due.length === 0) return { reminded: 0 };

    const brand = await brandBits();
    let reminded = 0;

    for (const item of due) {
      if (!item.customerEmail) continue;

      await supabase
        .from('order_items')
        .update({ reminder_sent_at: now.toISOString() })
        .eq('id', item.id);

      const daysLeft = daysUntilAutoApproval(item, now) ?? 0;
      const result = await emailService.send({
        ...approvalReminder(
          {
            domain: item.domain,
            orderReference: item.orderReference,
            orderId: item.orderId,
            daysLeft,
            autoApproveAt: item.autoApproveAt!,
          },
          brand,
        ),
        to: item.customerEmail,
        template: 'approval-reminder',
        orderId: item.orderId,
        orderItemId: item.id,
        // One warning per placement per day, whatever runs the job.
        idempotencyKey: `reminder:${item.id}:${now.toISOString().slice(0, 10)}`,
      });

      if (result.sent) reminded += 1;
    }

    return { reminded };
  },

  /**
   * Approve what the clock has run out on.
   *
   * Marked as approved by the clock rather than by the customer, because the
   * two are not the same thing and only one of them is consent. If a
   * placement is ever argued about, "they never replied" is the honest
   * answer and this is what records it.
   */
  async autoApproveDue(): Promise<{ approved: number }> {
    if (!isSupabaseEnabled()) return { approved: 0 };

    const supabase = getAdminScopedClient();
    const now = new Date();

    const { data } = await supabase
      .from('order_items')
      .select('id, order_id, delivered_at, approval, auto_approve_at')
      .eq('approval', 'pending')
      .not('delivered_at', 'is', null)
      .lte('auto_approve_at', now.toISOString());

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const rows = ((data ?? []) as any[]).map((row) => ({
      id: row.id as string,
      orderId: row.order_id as string,
      deliveredAt: row.delivered_at ?? undefined,
      approval: (row.approval ?? 'pending') as DeliverableItem['approval'],
      autoApproveAt: row.auto_approve_at ?? undefined,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Filtered again in code rather than trusting the query alone: the rule
    // lives in one place and is tested there.
    const due = dueForAutoApproval(rows, now);
    if (due.length === 0) return { approved: 0 };

    await supabase
      .from('order_items')
      .update({ approval: 'approved', approved_at: now.toISOString(), auto_approved: true })
      .in(
        'id',
        due.map((item) => item.id),
      );

    for (const orderId of new Set(due.map((item) => item.orderId))) {
      await closeOrderIfDone(orderId);
    }

    return { approved: due.length };
  },
};
