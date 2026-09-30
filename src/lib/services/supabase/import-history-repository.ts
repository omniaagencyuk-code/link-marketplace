import { getAdminScopedClient } from '@/lib/supabase/server';
import type { DuplicateMode } from '@/lib/import/types';
import type { ImportRun } from '../import-history-service';

/**
 * Import history, in the table that has been waiting for it.
 *
 * `import_runs` was created in migration 0006, given an index and an
 * admin-only policy, and then never written to. The service kept its runs in
 * a module-level array instead - which is to say in the memory of whichever
 * server process happened to handle the request, lost at the next deploy,
 * cold start or scale event, and never shared between instances.
 *
 * Nothing failed visibly. The panel on the websites page simply showed
 * nothing most of the time, which reads like "no imports yet" rather than
 * "this cannot remember". It only became a problem when somebody needed the
 * history as evidence: asked which imports had recorded failed rows, the
 * honest answer was that no import had ever recorded anything at all.
 *
 * The column names are the ones from 0006 rather than the field names on
 * `ImportRun`, so the mapping is spelled out in both directions below.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A row as 0006 spells it, to `ImportRun` as the app spells it.
 *
 * Exported for the sake of being checkable. Seven numbers go across this
 * mapping into seven differently-named fields, and two of them swapped would
 * be a history that reads plausibly and says the wrong thing for ever -
 * which is not a failure any amount of looking at the screen would catch.
 */
export function toRun(row: any): ImportRun {
  return {
    id: String(row.id),
    fileName: String(row.file_name ?? ''),
    adminEmail: String(row.run_by ?? ''),
    duplicateMode: (row.duplicate_mode === 'update' ? 'update' : 'skip') as DuplicateMode,
    rowsUploaded: Number(row.total_rows ?? 0),
    rowsAdded: Number(row.created ?? 0),
    rowsUpdated: Number(row.updated ?? 0),
    rowsSkipped: Number(row.skipped ?? 0),
    rowsFailed: Number(row.failed ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const supabaseImportHistoryRepository = {
  async record(run: Omit<ImportRun, 'id' | 'createdAt'>): Promise<ImportRun> {
    const supabase = getAdminScopedClient();

    const { data, error } = await supabase
      .from('import_runs')
      .insert({
        file_name: run.fileName,
        run_by: run.adminEmail,
        duplicate_mode: run.duplicateMode,
        total_rows: run.rowsUploaded,
        created: run.rowsAdded,
        updated: run.rowsUpdated,
        skipped: run.rowsSkipped,
        failed: run.rowsFailed,
      })
      .select('*')
      .single();

    // Throws rather than returning a plausible-looking record. A history that
    // silently does not record is the failure this replaces, and doing it
    // again here - with a row object built from the argument - would look
    // exactly like success to the caller and to the screen.
    if (error) throw new Error(`Failed to record the import: ${error.message}`);
    return toRun(data);
  },

  async getRecent(limit = 10): Promise<ImportRun[]> {
    const supabase = getAdminScopedClient();

    // Keyed to a handful of rows by `limit`, which is what this asks for -
    // not a full read taking its first page and calling it the whole history.
    const { data, error } = await supabase
      .from('import_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)));

    if (error) throw new Error(`Failed to load the import history: ${error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map(toRun);
  },
};
