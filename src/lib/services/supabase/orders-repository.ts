import { getAdminScopedClient, getServerClient } from '@/lib/supabase/server';
import { readAllPages } from './paged';
import {
  mapContentItem,
  mapContentOrder,
  mapOrder,
  mapProfile,
  type ContentItemRow,
  type ContentOrderRow,
  type OrderRow,
  type ProfileRow,
} from '@/lib/supabase/mappers';
import { defaultSettings } from '@/lib/data/settings';
import type { ContentSummary, ContentItemRow as ContentRow, CreateContentOrderInput } from '../content-service';
import type { OrderSummary } from '../order-service';
import type {
  BrandSettings,
  ContentDelivery,
  ContentOrder,
  ContentOrderItem,
  ContentOrderStatus,
  Order,
  OrderStatus,
  UserProfile,
} from '@/lib/types';

/**
 * Orders, content orders, profiles and settings, backed by Supabase.
 *
 * Every read goes through the signed-in user's client, so row level security
 * does the scoping. That is deliberate: the mock implementations filter by
 * user id in JavaScript, and if a query here forgot to, the database would
 * still refuse. Two layers, and the lower one cannot be bypassed by a mistake
 * in the upper.
 */

const ORDER_SELECT = '*, order_items (*, order_item_issues (*))';
const CONTENT_ORDER_SELECT =
  '*, content_order_items (*, content_revisions (*), content_messages (*), content_deliveries (*))';
const CONTENT_ITEM_SELECT =
  '*, content_revisions (*), content_messages (*), content_deliveries (*)';

const activeOrderStatuses: OrderStatus[] = ['awaiting-content', 'in-progress', 'submitted'];
const activeContentStatuses: ContentOrderStatus[] = [
  'brief-received',
  'writing',
  'editing',
  'ready-for-review',
  'revision-requested',
];

// ------------------------------------------------------------------- orders

export const supabaseOrderRepository = {
  /**
   * Every order, paged.
   *
   * This asked for all of them in one request and discarded the error. Both
   * halves were wrong in the same direction - quietly short. PostgREST caps a
   * response at a thousand rows and puts nothing in it to say so, and a
   * failed query arrived as an empty array, which renders as a marketplace
   * that has never sold anything.
   *
   * `/admin/orders` used to be the caller and now asks for one page through
   * `adminPage`; this stays correct for anything that genuinely wants the
   * lot, and ordered by `id` as well because paging by offset over
   * `placed_at` alone walks an order the database may break ties in
   * differently on each request.
   */
  async getAll(): Promise<Order[]> {
    const supabase = await getServerClient();
    const rows = await readAllPages<OrderRow>('every order', (from, to) =>
      supabase
        .from('orders')
        .select(ORDER_SELECT)
        .order('placed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.map(mapOrder);
  },

  /**
   * One page of the admin order table.
   *
   * The same arrangement as the website table's: the function returns the ids
   * for the page and the total, and the rows are read through the select this
   * file already has, so nothing duplicates the row-to-object mapping.
   *
   * The service role rather than the signed-in client. An administrator may
   * hold a Supabase account carrying `role = 'admin'`, in which case the
   * policy on `orders` would let this through - but they may equally be
   * signed in with the shared password alone, which carries no `auth.uid()`
   * at all and would return an empty table. The admin area's own convention
   * settles it: admin reads go through the service role, so the screen does
   * not depend on which way somebody happened to sign in.
   */
  async adminPage(
    search: string,
    status: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: Order[]; total: number }> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('admin_order_page', {
      p_search: search.trim() || null,
      p_status: status || 'all',
      p_limit: pageSize,
      p_offset: Math.max(0, (page - 1) * pageSize),
    });

    if (error) throw new Error(`Could not read the order list: ${error.message}`);

    const rows = (data ?? []) as { id: string; total: number }[];
    const total = Number(rows[0]?.total ?? 0);
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return { items: [], total };

    const { data: full, error: rowsError } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('id', ids);

    if (rowsError) throw new Error(`Could not read the order list: ${rowsError.message}`);

    const byId = new Map(
      ((full as unknown as OrderRow[] | null) ?? []).map((row) => [row.id, mapOrder(row)]),
    );

    // The order is the function's. `in (...)` returns rows in whatever order
    // it likes, and re-sorting here would undo it.
    return {
      items: ids.map((id) => byId.get(id)).filter((order): order is Order => Boolean(order)),
      total,
    };
  },

  /**
   * One customer's orders.
   *
   * Paged and checked for the same reason as `getAll`, though the number that
   * bites is different: nobody has a thousand orders, but anybody can have a
   * query fail, and this one failing used to show a paying customer an empty
   * order history rather than an error.
   */
  async getByUser(userId: string): Promise<Order[]> {
    const supabase = await getServerClient();
    const rows = await readAllPages<OrderRow>('a customer\'s orders', (from, to) =>
      supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('user_id', userId)
        .order('placed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.map(mapOrder);
  },

  async getById(id: string): Promise<Order | null> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).maybeSingle();
    return data ? mapOrder(data as unknown as OrderRow) : null;
  },

  async getByReference(reference: string): Promise<Order | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .eq('reference', reference)
      .maybeSingle();
    return data ? mapOrder(data as unknown as OrderRow) : null;
  },

  async getSummary(userId: string): Promise<OrderSummary> {
    const orders = await supabaseOrderRepository.getByUser(userId);
    return {
      activeOrders: orders.filter((order) => activeOrderStatuses.includes(order.status)).length,
      completedOrders: orders.filter((order) => order.status === 'live').length,
      pendingActionOrders: orders.filter((order) => order.status === 'awaiting-content').length,
      totalSpendMinor: orders
        .filter((order) => order.status !== 'cancelled' && order.status !== 'draft')
        .reduce((sum, order) => sum + order.totalMinor, 0),
    };
  },

  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const supabase = await getServerClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('orders')
      .update({ status, updated_at: now })
      .eq('id', id);
    if (error) throw new Error(`Failed to update order: ${error.message}`);

    // Items follow the order, matching the mock behaviour.
    await supabase.from('order_items').update({ status, updated_at: now }).eq('order_id', id);

    return supabaseOrderRepository.getById(id);
  },
};

// ----------------------------------------------------------- content orders

function flatten(orders: ContentOrder[]): ContentRow[] {
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

/** Refresh an order's rolled-up status and total after an item changes. */
async function touchOrder(orderId: string) {
  const supabase = await getServerClient();
  const { data } = await supabase
    .from('content_orders')
    .select(CONTENT_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return;

  const order = mapContentOrder(data as unknown as ContentOrderRow);
  await supabase
    .from('content_orders')
    .update({
      status: rollUpStatus(order.items),
      total_minor: order.items
        .filter((item) => item.status !== 'cancelled')
        .reduce((sum, item) => sum + item.priceMinor, 0),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);
}

export const supabaseContentRepository = {
  /**
   * Every content order, paged.
   *
   * The same pair of faults the placement orders had, left behind when those
   * were fixed: one request, which PostgREST caps without saying so, and a
   * discarded error, which turns a failed query into "no content orders has
   * ever been ordered". `/admin/content-orders` is the caller and renders
   * every row it is given.
   */
  async getAll(): Promise<ContentOrder[]> {
    const supabase = await getServerClient();
    const rows = await readAllPages<ContentOrderRow>('every content order', (from, to) =>
      supabase
        .from('content_orders')
        .select(CONTENT_ORDER_SELECT)
        .order('placed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.map(mapContentOrder);
  },

  async getByUser(userId: string): Promise<ContentOrder[]> {
    const supabase = await getServerClient();
    const rows = await readAllPages<ContentOrderRow>('a customer\'s content orders', (from, to) =>
      supabase
        .from('content_orders')
        .select(CONTENT_ORDER_SELECT)
        .eq('user_id', userId)
        .order('placed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.map(mapContentOrder);
  },

  async getAllItems(): Promise<ContentRow[]> {
    return flatten(await supabaseContentRepository.getAll());
  },

  async getItemsByUser(userId: string): Promise<ContentRow[]> {
    return flatten(await supabaseContentRepository.getByUser(userId));
  },

  /**
   * One article by id.
   *
   * `userId` narrows the lookup as a second check; RLS already refuses another
   * customer's row, so this returning null and the database refusing agree.
   */
  async getItem(itemId: string, userId?: string): Promise<ContentRow | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('content_order_items')
      .select(`${CONTENT_ITEM_SELECT}, content_orders (*)`)
      .eq('id', itemId)
      .maybeSingle();
    if (!data) return null;

    const raw = data as unknown as ContentItemRow & { content_orders: ContentOrderRow | null };
    const parent = raw.content_orders;
    if (!parent) return null;
    if (userId && parent.user_id !== userId) return null;

    return {
      item: mapContentItem(raw),
      orderReference: parent.reference,
      placedAt: parent.placed_at,
      currency: parent.currency ?? 'GBP',
      customerName: parent.customer_name ?? '',
      customerEmail: parent.customer_email ?? '',
      userId: parent.user_id,
    };
  },

  async getSummary(userId: string): Promise<ContentSummary> {
    const rows = await supabaseContentRepository.getItemsByUser(userId);
    return {
      activeOrders: rows.filter((row) => activeContentStatuses.includes(row.item.status)).length,
      awaitingReview: rows.filter((row) => row.item.status === 'ready-for-review').length,
      completedArticles: rows.filter((row) => row.item.status === 'complete').length,
      totalSpendMinor: rows
        .filter((row) => row.item.status !== 'cancelled' && row.item.status !== 'draft')
        .reduce((sum, row) => sum + row.item.priceMinor, 0),
    };
  },

  async create(input: CreateContentOrderInput): Promise<ContentOrder> {
    const supabase = await getServerClient();

    // References are human-facing, so they are sequential rather than random.
    // Derived from the current count, which is enough at this volume and does
    // not need a sequence object.
    const { count } = await supabase
      .from('content_orders')
      .select('id', { count: 'exact', head: true });
    const reference = `PPC-${1042 + (count ?? 0)}`;

    const { data: order, error } = await supabase
      .from('content_orders')
      .insert({
        reference,
        user_id: input.userId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        currency: input.currency,
        status: 'brief-received',
        total_minor: input.articles.reduce((sum, article) => sum + article.priceMinor, 0),
      })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create content order: ${error.message}`);

    const { error: itemsError } = await supabase.from('content_order_items').insert(
      input.articles.map((article, index) => ({
        order_id: order.id,
        reference: `${reference}-${String(index + 1).padStart(2, '0')}`,
        brief: article.brief,
        price_minor: article.priceMinor,
        status: 'brief-received',
      })),
    );
    if (itemsError) throw new Error(`Failed to create articles: ${itemsError.message}`);

    const { data: full } = await supabase
      .from('content_orders')
      .select(CONTENT_ORDER_SELECT)
      .eq('id', order.id)
      .single();
    return mapContentOrder(full as unknown as ContentOrderRow);
  },

  async updateItem(
    itemId: string,
    patch: Partial<Pick<ContentOrderItem, 'status' | 'priceMinor' | 'writerName' | 'internalNotes'>>,
  ): Promise<ContentOrderItem | null> {
    const supabase = await getServerClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.priceMinor !== undefined) row.price_minor = patch.priceMinor;
    if (patch.writerName !== undefined) row.writer_name = patch.writerName ?? null;
    if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes ?? null;

    const { data, error } = await supabase
      .from('content_order_items')
      .update(row)
      .eq('id', itemId)
      .select(`${CONTENT_ITEM_SELECT}, order_id`)
      .maybeSingle();
    if (error || !data) return null;

    const item = mapContentItem(data as unknown as ContentItemRow);
    await touchOrder(item.orderId);
    return item;
  },

  async requestRevision(
    itemId: string,
    userId: string,
    notes: string,
  ): Promise<ContentOrderItem | null> {
    const row = await supabaseContentRepository.getItem(itemId, userId);
    if (!row) return null;

    const supabase = await getServerClient();
    await supabase.from('content_revisions').insert({ item_id: itemId, notes });
    return supabaseContentRepository.updateItem(itemId, { status: 'revision-requested' });
  },

  async addMessage(
    itemId: string,
    message: { authorRole: 'customer' | 'team'; authorName: string; body: string },
  ): Promise<ContentOrderItem | null> {
    const supabase = await getServerClient();
    const { error } = await supabase.from('content_messages').insert({
      item_id: itemId,
      author_role: message.authorRole,
      author_name: message.authorName,
      body: message.body,
    });
    if (error) return null;

    const row = await supabaseContentRepository.getItem(itemId);
    return row?.item ?? null;
  },

  async addDelivery(
    itemId: string,
    delivery: Omit<ContentDelivery, 'id' | 'deliveredAt'>,
  ): Promise<ContentOrderItem | null> {
    const supabase = await getServerClient();
    const { error } = await supabase.from('content_deliveries').insert({
      item_id: itemId,
      kind: delivery.kind,
      file_name: delivery.fileName,
      body: delivery.body ?? null,
    });
    if (error) return null;

    return supabaseContentRepository.updateItem(itemId, {
      status: delivery.kind === 'final' ? 'complete' : 'ready-for-review',
    });
  },
};

// ------------------------------------------------------------------ profiles

/** A profile plus the two figures the admin user table shows beside it. */
export interface UserWithTotals extends UserProfile {
  orders: number;
  spendMinor: number;
}

export const supabaseUserRepository = {
  /**
   * Every account with its order count and lifetime spend, in one query.
   *
   * The admin user list read every profile and every order and filtered the
   * orders once per user - a nested loop over two whole tables, growing as
   * the product of both. `admin_user_rows` does it as one grouped join.
   */
  async listWithTotals(): Promise<UserWithTotals[]> {
    const supabase = getAdminScopedClient();
    const { data, error } = await supabase.rpc('admin_user_rows');
    if (error) throw new Error(`Failed to load the user list: ${error.message}`);

    type Row = ProfileRow & { orders: number; spend_minor: number };
    return ((data ?? []) as Row[]).map((row) => ({
      ...mapProfile(row),
      orders: Number(row.orders ?? 0),
      spendMinor: Number(row.spend_minor ?? 0),
    }));
  },

  /**
   * Every profile, paged.
   *
   * Nothing calls this today - `/admin/users` counts in the database through
   * `admin_user_rows` - but it was the last read in this file still asking
   * for a whole table in one request and throwing its error away. Left as it
   * was it is a trap: the next person to want a list of customers finds a
   * method that looks right and silently stops at a thousand, which the
   * marketplace is not far off.
   */
  async getAll(): Promise<UserProfile[]> {
    const supabase = await getServerClient();
    const rows = await readAllPages<ProfileRow>('every profile', (from, to) =>
      supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    );
    return rows.map(mapProfile);
  },

  async getById(id: string): Promise<UserProfile | null> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    return data ? mapProfile(data as unknown as ProfileRow) : null;
  },

  async getByEmail(email: string): Promise<UserProfile | null> {
    const supabase = await getServerClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', email.trim())
      .maybeSingle();
    return data ? mapProfile(data as unknown as ProfileRow) : null;
  },
};

// ------------------------------------------------------------------ settings

const SETTINGS_ID = 'settings_default';

export const supabaseSettingsRepository = {
  async get(): Promise<BrandSettings> {
    const supabase = await getServerClient();
    const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    if (!data) return defaultSettings;

    const row = data as Record<string, unknown>;
    // Settings are a single row of loosely-typed configuration, so each field
    // falls back to the shipped default rather than failing the page.
    return {
      ...defaultSettings,
      id: (row.id as string) ?? SETTINGS_ID,
      brandName: (row.brand_name as string) ?? defaultSettings.brandName,
      supportEmail: (row.support_email as string) ?? defaultSettings.supportEmail,
      salesEmail: (row.sales_email as string) ?? defaultSettings.salesEmail,
      primaryColour: (row.primary_colour as string) ?? defaultSettings.primaryColour,
      accentColour: (row.accent_colour as string) ?? defaultSettings.accentColour,
      currency: (row.currency as BrandSettings['currency']) ?? defaultSettings.currency,
      defaultPageSize: (row.default_page_size as number) ?? defaultSettings.defaultPageSize,
      defaultSort: (row.default_sort as string) ?? defaultSettings.defaultSort,
      marginPct: (row.margin_pct as number) ?? defaultSettings.marginPct,
      contentPricing:
        (row.content_pricing as BrandSettings['contentPricing']) ?? defaultSettings.contentPricing,
      deliveryAutoApproveDays:
        (row.delivery_auto_approve_days as number) ?? defaultSettings.deliveryAutoApproveDays,
      postApprovalIssueDays:
        (row.post_approval_issue_days as number) ?? defaultSettings.postApprovalIssueDays,
      approvalReminderDays:
        (row.approval_reminder_days as number) ?? defaultSettings.approvalReminderDays,
      updatedAt: (row.updated_at as string) ?? defaultSettings.updatedAt,
    };
  },

  async update(patch: Partial<BrandSettings>): Promise<BrandSettings> {
    const supabase = await getServerClient();
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.brandName !== undefined) row.brand_name = patch.brandName;
    if (patch.supportEmail !== undefined) row.support_email = patch.supportEmail;
    if (patch.salesEmail !== undefined) row.sales_email = patch.salesEmail;
    if (patch.primaryColour !== undefined) row.primary_colour = patch.primaryColour;
    if (patch.accentColour !== undefined) row.accent_colour = patch.accentColour;
    if (patch.currency !== undefined) row.currency = patch.currency;
    if (patch.defaultPageSize !== undefined) row.default_page_size = patch.defaultPageSize;
    if (patch.defaultSort !== undefined) row.default_sort = patch.defaultSort;
    if (patch.marginPct !== undefined) row.margin_pct = patch.marginPct;
    if (patch.contentPricing !== undefined) row.content_pricing = patch.contentPricing;
    if (patch.deliveryAutoApproveDays !== undefined)
      row.delivery_auto_approve_days = patch.deliveryAutoApproveDays;
    if (patch.postApprovalIssueDays !== undefined)
      row.post_approval_issue_days = patch.postApprovalIssueDays;
    if (patch.approvalReminderDays !== undefined)
      row.approval_reminder_days = patch.approvalReminderDays;

    const { data } = await supabase.from('settings').select('id').limit(1).maybeSingle();
    if (data?.id) {
      await supabase.from('settings').update(row).eq('id', data.id);
    } else {
      await supabase.from('settings').insert(row);
    }

    return supabaseSettingsRepository.get();
  },
};
