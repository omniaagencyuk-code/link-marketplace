'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { storageKey } from '@/lib/config/brand';
import type { ContentBrief, ContentDraftItem } from '@/lib/types/content';

const STORAGE_KEY = storageKey('content-draft.v1');

interface ContentDraftContextValue {
  items: ContentDraftItem[];
  add: (brief: ContentBrief, quantity?: number) => void;
  update: (id: string, patch: { brief?: ContentBrief; quantity?: number }) => void;
  remove: (id: string) => void;
  clear: () => void;
  /** Total articles, counting quantities - "3 x 1,000 words" is three. */
  count: number;
  /** Total words across the basket, for the summary line. */
  totalWords: number;
  hydrated: boolean;
}

const ContentDraftContext = createContext<ContentDraftContextValue | null>(null);

/**
 * The content basket.
 *
 * Mirrors `OrderDraftProvider`: briefs are collected in the browser so a
 * customer can queue several articles before checking out, then submitted in
 * one server action that writes a real content order. Nothing here is
 * authoritative - prices are recalculated on the server at checkout.
 */
export function ContentDraftProvider({ children }: { children: ReactNode }) {
  const { value: items, setValue, hydrated } = useLocalStorage<ContentDraftItem[]>(STORAGE_KEY, []);

  const add = useCallback(
    (brief: ContentBrief, quantity = 1) => {
      setValue((current) => [
        ...current,
        {
          id: `cdraft_${Date.now().toString(36)}_${current.length}`,
          brief,
          quantity: Math.max(1, Math.min(50, Math.round(quantity))),
          addedAt: new Date().toISOString(),
        },
      ]);
    },
    [setValue],
  );

  const update = useCallback(
    (id: string, patch: { brief?: ContentBrief; quantity?: number }) => {
      setValue((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(patch.brief ? { brief: patch.brief } : {}),
                ...(patch.quantity !== undefined
                  ? { quantity: Math.max(1, Math.min(50, Math.round(patch.quantity))) }
                  : {}),
              }
            : item,
        ),
      );
    },
    [setValue],
  );

  const value = useMemo<ContentDraftContextValue>(
    () => ({
      items,
      add,
      update,
      remove: (id: string) => setValue((current) => current.filter((item) => item.id !== id)),
      clear: () => setValue([]),
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      totalWords: items.reduce((sum, item) => sum + item.brief.wordCount * item.quantity, 0),
      hydrated,
    }),
    [items, add, update, setValue, hydrated],
  );

  return <ContentDraftContext.Provider value={value}>{children}</ContentDraftContext.Provider>;
}

export function useContentDraft() {
  const context = useContext(ContentDraftContext);
  if (!context) throw new Error('useContentDraft must be used inside <ContentDraftProvider>');
  return context;
}
