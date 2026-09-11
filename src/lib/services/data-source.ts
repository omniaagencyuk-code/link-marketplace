/**
 * Which backend the service layer talks to.
 *
 * Today only `mock` is implemented. When Supabase is connected, add a
 * `supabase` implementation next to each mock repository and switch on this
 * value inside the service - no component should ever need to change.
 */
export type DataSource = 'mock' | 'supabase';

export const dataSource: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource | undefined) ?? 'mock';

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

/** Thrown by service methods that have no implementation for the active source. */
export class DataSourceNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `${method} is not implemented for the "${dataSource}" data source yet. ` +
        'See supabase/README.md for the migration steps.',
    );
    this.name = 'DataSourceNotImplementedError';
  }
}
