'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { storageKey } from '@/lib/config/brand';
import type { DraftOrderItem } from '@/lib/types';

const STORAGE_KEY = storageKey('order-draft.v1');

interface OrderDraftContextValue {
  items: DraftOrderItem[];
  add: (item: Omit<DraftOrderItem, 'id' | 'addedAt'>) => void;
  remove: (id: string) => void;
  clear: () => void;
  totalMinor: number;
  count: number;
  hydrated: boolean;
}

const OrderDraftContext = createContext<OrderDraftContextValue | null>(null);

/**
 * The in-progress order ("basket").
 *
 * No payments are processed - submitting simply creates a draft order. The
 * Supabase implementation will write to `orders` / `order_items` instead.
 */
export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const { value: items, setValue, hydrated } = useLocalStorage<DraftOrderItem[]>(STORAGE_KEY, []);

  const add = useCallback(
    (item: Omit<DraftOrderItem, 'id' | 'addedAt'>) => {
      setValue((current) => [
        ...current,
        {
          ...item,
          id: `draft_${Date.now().toString(36)}_${current.length}`,
          addedAt: new Date().toISOString(),
        },
      ]);
    },
    [setValue],
  );

  const value = useMemo<OrderDraftContextValue>(
    () => ({
      items,
      add,
      remove: (id: string) => setValue((current) => current.filter((item) => item.id !== id)),
      clear: () => setValue([]),
      totalMinor: items.reduce((sum, item) => sum + item.priceMinor, 0),
      count: items.length,
      hydrated,
    }),
    [items, add, setValue, hydrated],
  );

  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>;
}

export function useOrderDraft() {
  const context = useContext(OrderDraftContext);
  if (!context) throw new Error('useOrderDraft must be used inside <OrderDraftProvider>');
  return context;
}
