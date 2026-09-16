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
 *
 * `getAdminScopedClient()` is what the admin area runs as. See its comment:
 * the short version is that the admin signs in with a shared password rather
 * than through Supabase Auth, so its requests carry no `auth.uid()` at all.
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

/**
 * The client the admin area's own reads and writes run as.
 *
 * The admin authenticates with a shared password and a server-signed cookie,
 * not Supabase Auth. Its requests therefore carry no Supabase identity:
 * `auth.uid()` is null, `public.is_admin()` is false, and row level security
 * treats an administrator exactly like a signed-out stranger. Every admin
 * write is refused, and every admin read is narrowed to the public view -
 * which is why saving a new website as a draft failed outright, and why a
 * draft listing would not have appeared in the admin list even if it had
 * saved.
 *
 * So admin operations run as the service role. That is sound because the
 * caller has already proved who it is before reaching here: the proxy gates
 * /admin, and every admin page and action calls `requireAdminSession()`. The
 * key is read from a server-only variable and this module is never reachable
 * from the browser.
 *
 * The honest description of this is that authorisation for the admin area
 * lives in the application rather than in the database. When admins move to
 * Supabase Auth, every call site here goes back to `getServerClient()` and the
 * existing RLS policies enforce it again with nothing else to change.
 */
export function getAdminScopedClient() {
  const client = getAdminClient();
  if (!client) {
    // Deliberately loud. The alternative - quietly using the user's client -
    // produces an RLS violation several layers down, which is a much harder
    // thing to diagnose than a missing variable.
    throw new Error(
      'The admin area needs the Supabase secret key. Set SUPABASE_SECRET_KEY ' +
        '(or SUPABASE_SERVICE_ROLE_KEY) in the server environment and redeploy.',
    );
  }
  return client;
}
