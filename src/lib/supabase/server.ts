import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAnonKey, supabaseUrl, serviceRoleKey } from './config';

/**
 * Supabase clients for server code.
 *
 * `getServerClient()` acts as the signed-in user: it carries their session, so
 * row level security applies exactly as written. This is what almost
 * everything should use.
 *
 * `getAdminClient()` bypasses RLS. It exists for the few operations that are
 * legitimately outside any single user's permissions - the bulk importer, the
 * seed script - and each call site says why.
 */

export async function getServerClient() {
  const store = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so a failure here is expected and
          // harmless rather than something to surface.
        }
      },
    },
  });
}

/**
 * Service-role client. Never import this from anything a browser can reach.
 *
 * Returns null when the key is absent, so a caller has to handle the
 * misconfigured case rather than silently running with reduced privileges.
 */
export function getAdminClient() {
  const key = serviceRoleKey();
  if (!key || !supabaseUrl) return null;

  return createServerClient(supabaseUrl, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // A service-role client has no user session to persist.
      },
    },
  });
}
