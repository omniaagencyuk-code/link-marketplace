import type { DuplicateMode } from '@/lib/import/types';

/**
 * Import history.
 *
 * In-memory alongside the rest of the mock data layer. When Supabase lands,
 * back this with an `import_runs` table; the shape below is already close to
 * the columns you would want.
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
    const entry: ImportRun = {
      ...run,
      id: `imp_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    store.unshift(entry);
    return entry;
  },

  async getRecent(limit = 10): Promise<ImportRun[]> {
    return store.slice(0, limit);
  },
};
