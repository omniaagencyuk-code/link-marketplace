/**
 * Which backend the service layer talks to.
 *
 * Only used for the error message below. To ask whether Supabase is actually
 * in use, call `isSupabaseEnabled()` from `lib/supabase/config` - that also
 * checks the credentials are present, which this value does not.
 */
export type DataSource = 'mock' | 'supabase';

export const dataSource: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource | undefined) ?? 'mock';

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
