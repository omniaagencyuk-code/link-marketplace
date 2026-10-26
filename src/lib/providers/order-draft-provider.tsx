'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { basketGrewAction } from '@/app/(app)/marketplace/actions';
import { storageKey } from '@/lib/config/brand';
import type { DraftOrderItem } from '@/lib/types';

const STORAGE_KEY = storageKey('order-draft.v1');

interface OrderDraftContextValue {
  items: DraftOrderItem[];
  add: (item: Omit<DraftOrderItem, 'id' | 'addedAt'>) => void;
  update: (id: string, patch: Partial<Omit<DraftOrderItem, 'id' | 'addedAt'>>) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Is this website already in the draft? */
  has: (websiteId: string) => boolean;
  totalMinor: number;
  count: number;
  /** Items still missing a target URL, which blocks submitting. */
  incompleteCount: number;
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

      /*
        Tell the server the basket grew, so the account's inventory budget
        starts again. Somebody choosing what to buy is the customer the
        marketplace is for, and 0090's guard was stopping them.

        Deliberately not awaited and deliberately swallowed. The basket is
        local storage and the item is already in it; a counter on our side
        is not a reason for Add to spin, and it is not a reason for Add to
        fail. The worst a lost call costs is that the next page of the
        marketplace is charged as it was before.
      */
      void basketGrewAction().catch(() => {});
    },
    [setValue],
  );

  const update = useCallback(
    (id: string, patch: Partial<Omit<DraftOrderItem, 'id' | 'addedAt'>>) => {
      setValue((current) =>
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [setValue],
  );

  const value = useMemo<OrderDraftContextValue>(
    () => ({
      items,
      add,
      update,
      remove: (id: string) => setValue((current) => current.filter((item) => item.id !== id)),
      clear: () => setValue([]),
      has: (websiteId: string) => items.some((item) => item.websiteId === websiteId),
      totalMinor: items.reduce((sum, item) => sum + item.priceMinor, 0),
      count: items.length,
      incompleteCount: items.filter((item) => !item.targetUrl.trim()).length,
      hydrated,
    }),
    [items, add, update, setValue, hydrated],
  );

  return <OrderDraftContext.Provider value={value}>{children}</OrderDraftContext.Provider>;
}

export function useOrderDraft() {
  const context = useContext(OrderDraftContext);
  if (!context) throw new Error('useOrderDraft must be used inside <OrderDraftProvider>');
  return context;
}
