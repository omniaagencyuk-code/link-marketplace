'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Persist a piece of state in localStorage.
 *
 * Built on `useSyncExternalStore` so the value is read through a snapshot
 * rather than an effect: server and first client render agree (no hydration
 * mismatch) and writes in one tab reach every other tab and every subscribed
 * component instantly.
 *
 * Swap for a Supabase-backed hook once accounts are connected.
 */

const listeners = new Set<() => void>();

/** Cache parsed values so snapshots stay referentially stable between reads. */
const cache = new Map<string, { raw: string | null; parsed: unknown }>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    // Storage can be unavailable in private browsing - fall back to default.
  }

  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.parsed as T;

  let parsed: unknown = fallback;
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = fallback;
    }
  }
  cache.set(key, { raw, parsed });
  return parsed as T;
}

function subscribeToNothing() {
  return () => {};
}

/** True once the client has taken over from the server-rendered markup. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const hydrated = useHydrated();

  const value = useSyncExternalStore(
    subscribe,
    () => read(key, initialValue),
    () => initialValue,
  );

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const current = read(key, initialValue);
      const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next;
      const raw = JSON.stringify(resolved);
      cache.set(key, { raw, parsed: resolved });
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Ignore write failures - state still updates for this session.
      }
      emit();
    },
    [key, initialValue],
  );

  return { value, setValue, hydrated } as const;
}
