import { orders as seedOrders } from '@/lib/data/orders';
import type { Order, OrderStatus } from '@/lib/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseOrderRepository } from './supabase/orders-repository';
import { mockStore } from './mock-store';

/**
 * Seed orders plus anything created at checkout.
 *
 * Shared with `checkout-service` through the process-wide registry, so an
 * order placed in mock mode actually appears in the dashboard rather than
 * vanishing into a second copy of the module.
 */
const orderStore = mockStore<Order>('orders');
for (const order of seedOrders) {
  if (!orderStore.has(order.id)) orderStore.set(order.id, { ...order });
}

const store = {
  get all(): Order[] {
    return [...orderStore.values()];
  },
};

export interface OrderSummary {
  activeOrders: number;
  completedOrders: number;
  totalSpendMinor: number;
  pendingActionOrders: number;
}

const activeStatuses: OrderStatus[] = ['awaiting-content', 'in-progress', 'submitted'];

export const orderService = {
  async getAll(): Promise<Order[]> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.getAll();

    return [...store.all].sort((a, b) => Date.parse(b.placedAt) - Date.parse(a.placedAt));
  },

  async getByUser(userId: string): Promise<Order[]> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.getByUser(userId);

    return (await orderService.getAll()).filter((order) => order.userId === userId);
  },

  async getById(id: string): Promise<Order | null> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.getById(id);

    return store.all.find((order) => order.id === id) ?? null;
  },

  async getByReference(reference: string): Promise<Order | null> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.getByReference(reference);

    return store.all.find((order) => order.reference === reference) ?? null;
  },

  async getSummary(userId: string): Promise<OrderSummary> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.getSummary(userId);

    const userOrders = store.all.filter((order) => order.userId === userId);
    return {
      activeOrders: userOrders.filter((order) => activeStatuses.includes(order.status)).length,
      completedOrders: userOrders.filter((order) => order.status === 'live').length,
      pendingActionOrders: userOrders.filter((order) => order.status === 'awaiting-content').length,
      totalSpendMinor: userOrders
        .filter((order) => order.status !== 'cancelled' && order.status !== 'draft')
        .reduce((sum, order) => sum + order.totalMinor, 0),
    };
  },

  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    if (isSupabaseEnabled()) return supabaseOrderRepository.updateStatus(id, status);

    const current = orderStore.get(id);
    if (!current) return null;

    const updated: Order = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      items: current.items.map((item) => ({ ...item, status })),
    };
    orderStore.set(id, updated);
    return updated;
  },
};
