'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl } from './config';

/**
 * The browser client.
 *
 * One instance per tab: the SDK keeps the session in memory and refreshes it
 * on a timer, so creating a new client per render would drop that state and
 * spawn duplicate refresh timers.
 */
let client: ReturnType<typeof createBrowserClient> | null = null;

export function getBrowserClient() {
  client ??= createBrowserClient(supabaseUrl, supabaseAnonKey);
  return client;
}
