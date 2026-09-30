import type { DuplicateMode } from '@/lib/import/types';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { supabaseImportHistoryRepository } from './supabase/import-history-repository';

/**
 * Import history.
 *
 * Backed by `import_runs` when Supabase is connected, and by the array below
 * when it is not - the same arrangement as every other service here.
 *
 * The array used to be the only implementation, long after the table existed.
 * A module-level array lives in one server process: it is emptied by every
 * deploy and cold start, and never seen by another instance. So the history
 * panel showed nothing nearly always, which reads as "no imports yet" rather
 * than "this cannot remember" - and when the history was finally needed as
 * evidence, of which imports had recorded failed rows, there was none to
 * give.
 */
export interface ImportRun {
  id: string;
  fileName: string;
  adminEmail: string;
  duplicateMode: DuplicateMode;
  rowsUploaded: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
  createdAt: string;
}

const store: ImportRun[] = [];

export const importHistoryService = {
  async record(run: Omit<ImportRun, 'id' | 'createdAt'>): Promise<ImportRun> {
    if (isSupabaseEnabled()) return supabaseImportHistoryRepository.record(run);

    const entry: ImportRun = {
      ...run,
      id: `imp_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    store.unshift(entry);
    return entry;
  },

  async getRecent(limit = 10): Promise<ImportRun[]> {
    if (isSupabaseEnabled()) return supabaseImportHistoryRepository.getRecent(limit);
    return store.slice(0, limit);
  },
};
