/**
 * Supabase connection details.
 *
 * Kept apart from the clients so that "is Supabase configured?" can be asked
 * without importing the SDK - the service layer needs that question answered
 * on every call to decide between the mock store and the database.
 *
 * Two generations of Supabase key naming are accepted, because a project
 * created today gets different names from one created a year ago:
 *
 *   old: NEXT_PUBLIC_SUPABASE_ANON_KEY   (a JWT, "eyJ...")
 *        SUPABASE_SERVICE_ROLE_KEY
 *   new: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  ("sb_publishable_...")
 *        SUPABASE_SECRET_KEY                   ("sb_secret_...")
 *
 * Both go in the same position in the client, so accepting either name means
 * whichever the dashboard hands you is the one you can paste.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';

/** The browser-safe key, under either name. */
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

/** True when the public credentials are present. */
export function hasSupabaseCredentials(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Whether the app should actually talk to Supabase.
 *
 * Deliberately not named `useSupabase`: that reads as a React hook to both
 * tooling and people, and this is called from the proxy and from server code.
 *
 * Both halves matter: the data source has to be switched on *and* the
 * credentials have to exist. A deployment with `NEXT_PUBLIC_DATA_SOURCE` set
 * to "supabase" but no keys falls back to the mock store rather than throwing
 * on every page, which keeps a misconfigured preview deploy readable instead
 * of a wall of errors.
 */
export function isSupabaseEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DATA_SOURCE === 'supabase' && hasSupabaseCredentials();
}

/**
 * The secret key. Server-only, and never referenced from a module that a
 * client component can reach.
 *
 * It bypasses row level security entirely, so it is used for exactly two
 * things: the seed/import scripts, and the handful of reads that legitimately
 * serve signed-out pages with redacted data. Everything else goes through the
 * publishable key plus the signed-in user's session, so RLS stays in force.
 */
export function serviceRoleKey(): string | undefined {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
}
