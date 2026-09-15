import { contentOrders as seedContentOrders } from '@/lib/data/content-orders';
import type {
  ContentBrief,
  ContentDelivery,
  ContentOrder,
  ContentOrderItem,
  ContentOrderStatus,
} from '@/lib/types/content';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseContentRepository } from './supabase/orders-repository';

/**
 * Content order repository.
 *
 * Same contract as the other services: an in-memory store today, one Supabase
 * table pair (`content_orders` / `content_order_items`) tomorrow. Every read
 * and write goes through here, so swapping the bodies is the whole migration.
 *
 * Note that reads are scoped by user at the service boundary
 * (`getByUser`, `getForUser`) rather than filtered in the page, so a page
 * cannot accidentally render someone else's brief.
 */

const store: ContentOrder[] = seedContentOrders.map((order) => ({ ...order }));

let idSequence = 0;
let referenceSequence = 1042;

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${(idSequence++).toString(36)}`;
}

const activeStatuses: ContentOrderStatus[] = [
  'brief-received',
  'writing',
  'editing',
  'ready-for-review',
  'revision-requested',
];

export interface ContentSummary {
  activeOrders: number;
  awaitingReview: number;
  completedArticles: number;
  totalSpendMinor: number;
}

/** A single article plus the order it belongs to, for list views. */
export interface ContentItemRow {
  item: ContentOrderItem;
  orderReference: string;
  placedAt: string;
  currency: ContentOrder['currency'];
  customerName: string;
  customerEmail: string;
  userId: string;
}

function flatten(orders: ContentOrder[]): ContentItemRow[] {
  return orders
    .flatMap((order) =>
      order.items.map((item) => ({
        item,
        orderReference: order.reference,
        placedAt: order.placedAt,
        currency: order.currency,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        userId: order.userId,
      })),
    )
    .sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt));
}

/** Recompute an order's headline status from the articles inside it. */
function rollUpStatus(items: ContentOrderItem[]): ContentOrderStatus {
  if (items.length === 0) return 'draft';
  if (items.every((item) => item.status === 'complete')) return 'complete';
  if (items.every((item) => item.status === 'cancelled')) return 'cancelled';
  const live = items.filter((item) => item.status !== 'cancelled');
  if (live.some((item) => item.status === 'revision-requested')) return 'revision-requested';
  if (live.some((item) => item.status === 'ready-for-review')) return 'ready-for-review';
  if (live.some((item) => item.status === 'editing')) return 'editing';
  if (live.some((item) => item.status === 'writing')) return 'writing';
  return 'brief-received';
}

function touch(order: ContentOrder): ContentOrder {
  return {
    ...order,
    status: rollUpStatus(order.items),
    totalMinor: order.items
      .filter((item) => item.status !== 'cancelled')
      .reduce((sum, item) => sum + item.priceMinor, 0),
    updatedAt: new Date().toISOString(),
  };
}

export interface CreateContentOrderInput {
  userId: string;
  customerName: string;
  customerEmail: string;
  currency: ContentOrder['currency'];
  articles: { brief: ContentBrief; priceMinor: number }[];
}

export const contentService = {
  async getAll(): Promise<ContentOrder[]> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getAll();

    return [...store].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
  },

  async getByUser(userId: string): Promise<ContentOrder[]> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getByUser(userId);

    return (await contentService.getAll()).filter((order) => order.userId === userId);
  },

  /** Every article across the marketplace, newest first. Admin only. */
  async getAllItems(): Promise<ContentItemRow[]> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getAllItems();

    return flatten(await contentService.getAll());
  },

  /** Every article belonging to one customer, newest first. */
  async getItemsByUser(userId: string): Promise<ContentItemRow[]> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getItemsByUser(userId);

    return flatten(await contentService.getByUser(userId));
  },

  /**
   * One article by id. `userId` scopes the lookup, so a customer passing
   * someone else's id gets null rather than a foreign brief.
   */
  async getItem(itemId: string, userId?: string): Promise<ContentItemRow | null> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getItem(itemId, userId);

    const rows = flatten(store);
    const row = rows.find((entry) => entry.item.id === itemId) ?? null;
    if (!row) return null;
    if (userId && row.userId !== userId) return null;
    return row;
  },

  async getSummary(userId: string): Promise<ContentSummary> {
    if (isSupabaseEnabled()) return supabaseContentRepository.getSummary(userId);

    const rows = await contentService.getItemsByUser(userId);
    return {
      activeOrders: rows.filter((row) => activeStatuses.includes(row.item.status)).length,
      awaitingReview: rows.filter((row) => row.item.status === 'ready-for-review').length,
      completedArticles: rows.filter((row) => row.item.status === 'complete').length,
      totalSpendMinor: rows
        .filter((row) => row.item.status !== 'cancelled' && row.item.status !== 'draft')
        .reduce((sum, row) => sum + row.item.priceMinor, 0),
    };
  },

  /** Place a content order. One order can hold several articles. */
  async create(input: CreateContentOrderInput): Promise<ContentOrder> {
    if (isSupabaseEnabled()) return supabaseContentRepository.create(input);

    const now = new Date().toISOString();
    const orderId = newId('cord');
    const reference = `PPC-${referenceSequence++}`;

    const items: ContentOrderItem[] = input.articles.map((article, index) => ({
      id: newId('citem'),
      orderId,
      reference: `${reference}-${String(index + 1).padStart(2, '0')}`,
      brief: article.brief,
      status: 'brief-received',
      priceMinor: article.priceMinor,
      revisions: [],
      messages: [],
      deliveries: [],
      createdAt: now,
      updatedAt: now,
    }));

    const order: ContentOrder = {
      id: orderId,
      reference,
      userId: input.userId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      status: 'brief-received',
      totalMinor: items.reduce((sum, item) => sum + item.priceMinor, 0),
      currency: input.currency,
      items,
      placedAt: now,
      updatedAt: now,
    };

    store.unshift(order);
    return order;
  },

  /** Apply a patch to one article and roll the parent order up. */
  async updateItem(
    itemId: string,
    patch: Partial<Pick<ContentOrderItem, 'status' | 'priceMinor' | 'writerName' | 'internalNotes'>>,
  ): Promise<ContentOrderItem | null> {
    if (isSupabaseEnabled()) return supabaseContentRepository.updateItem(itemId, patch);

    const orderIndex = store.findIndex((order) =>
      order.items.some((item) => item.id === itemId),
    );
    if (orderIndex === -1) return null;

    const order = store[orderIndex] as ContentOrder;
    const items = order.items.map((item) =>
      item.id === itemId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item,
    );
    store[orderIndex] = touch({ ...order, items });
    return items.find((item) => item.id === itemId) ?? null;
  },

  /** Record a customer's revision request against an article. */
  async requestRevision(
    itemId: string,
    userId: string,
    notes: string,
  ): Promise<ContentOrderItem | null> {
    if (isSupabaseEnabled()) {
      return supabaseContentRepository.requestRevision(itemId, userId, notes);
    }

    const row = await contentService.getItem(itemId, userId);
    if (!row) return null;

    const orderIndex = store.findIndex((order) => order.id === row.item.orderId);
    if (orderIndex === -1) return null;

    const order = store[orderIndex] as ContentOrder;
    const now = new Date().toISOString();
    const items = order.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: 'revision-requested' as ContentOrderStatus,
            revisions: [...item.revisions, { id: newId('rev'), requestedAt: now, notes }],
            updatedAt: now,
          }
        : item,
    );
    store[orderIndex] = touch({ ...order, items });
    return items.find((item) => item.id === itemId) ?? null;
  },

  /** Post a message onto an article's thread. */
  async addMessage(
    itemId: string,
    message: { authorRole: 'customer' | 'team'; authorName: string; body: string },
  ): Promise<ContentOrderItem | null> {
    if (isSupabaseEnabled()) return supabaseContentRepository.addMessage(itemId, message);

    const orderIndex = store.findIndex((order) =>
      order.items.some((item) => item.id === itemId),
    );
    if (orderIndex === -1) return null;

    const order = store[orderIndex] as ContentOrder;
    const now = new Date().toISOString();
    const items = order.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            messages: [...item.messages, { id: newId('msg'), createdAt: now, ...message }],
            updatedAt: now,
          }
        : item,
    );
    store[orderIndex] = touch({ ...order, items });
    return items.find((item) => item.id === itemId) ?? null;
  },

  /**
   * Attach a draft or final article.
   *
   * Only the file name and the pasted body are stored. When object storage is
   * connected this is where the upload and the signed download URL belong.
   */
  async addDelivery(
    itemId: string,
    delivery: Omit<ContentDelivery, 'id' | 'deliveredAt'>,
  ): Promise<ContentOrderItem | null> {
    if (isSupabaseEnabled()) return supabaseContentRepository.addDelivery(itemId, delivery);

    const orderIndex = store.findIndex((order) =>
      order.items.some((item) => item.id === itemId),
    );
    if (orderIndex === -1) return null;

    const order = store[orderIndex] as ContentOrder;
    const now = new Date().toISOString();
    const items = order.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            deliveries: [...item.deliveries, { id: newId('del'), deliveredAt: now, ...delivery }],
            status:
              delivery.kind === 'final'
                ? ('complete' as ContentOrderStatus)
                : ('ready-for-review' as ContentOrderStatus),
            updatedAt: now,
          }
        : item,
    );
    store[orderIndex] = touch({ ...order, items });
    return items.find((item) => item.id === itemId) ?? null;
  },
};
