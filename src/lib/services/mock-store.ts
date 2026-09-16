/**
 * Process-wide storage for the mock data source.
 *
 * A plain module-level `Map` is not enough. The bundler gives some route
 * groups their own copy of a server module, so a page written through an admin
 * action was visible to the marketing routes but invisible to /sitemap.xml -
 * which shares no bundle with either. The symptom was a published page that
 * rendered perfectly and never appeared in the sitemap.
 *
 * Hanging the store off `globalThis` gives every copy of the module the same
 * underlying Map, which is what a database would do. It also survives the
 * module reloads that dev mode performs on every edit.
 *
 * None of this makes the mock store durable - it is still memory, and still
 * lost on deploy. That is what the storage notice in the admin says, and why
 * production runs on Supabase.
 */

const REGISTRY = Symbol.for('pressparrot.mock-stores');

type Registry = Map<string, Map<string, unknown>>;

function registry(): Registry {
  const host = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
  host[REGISTRY] ??= new Map();
  return host[REGISTRY];
}

/** A named store, shared by every copy of the module that asks for it. */
export function mockStore<T>(name: string): Map<string, T> {
  const existing = registry().get(name);
  if (existing) return existing as Map<string, T>;

  const created = new Map<string, T>();
  registry().set(name, created as Map<string, unknown>);
  return created;
}
