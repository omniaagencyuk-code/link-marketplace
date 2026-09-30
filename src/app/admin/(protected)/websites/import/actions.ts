'use server';

import { revalidatePath } from 'next/cache';
import { importHistoryService, websiteService } from '@/lib/services';
import { requireAdminSession } from '@/lib/auth/admin-access';
import { sanitiseText } from '@/lib/import/normalise';
import type { DuplicateMode, ImportBatchResult, ImportPayloadRow } from '@/lib/import/types';

/**
 * Bulk import, one batch at a time.
 *
 * The browser sends chunks rather than the whole file so progress is visible
 * and no single request carries thousands of rows. Every call re-checks the
 * admin session, because a server action is reachable independently of the
 * page that renders it.
 */

/** Hard ceiling per request, independent of what the client asks for. */
const MAX_ROWS_PER_BATCH = 500;

export async function importWebsitesBatchAction(
  rows: ImportPayloadRow[],
  mode: DuplicateMode,
): Promise<ImportBatchResult> {
  await requireAdminSession();

  if (!Array.isArray(rows) || rows.length === 0) {
    return { created: 0, updated: 0, skipped: 0, failed: [] };
  }
  if (rows.length > MAX_ROWS_PER_BATCH) {
    return {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: rows.map((row) => ({
        rowNumber: row.rowNumber,
        domain: row.domain,
        reason: `Batch larger than ${MAX_ROWS_PER_BATCH} rows`,
      })),
    };
  }

  // Treat the payload as untrusted: it arrives from the browser.
  const safeMode: DuplicateMode = mode === 'update' ? 'update' : 'skip';
  return websiteService.bulkUpsert(rows, safeMode);
}

/** Called once the last batch lands, so the admin tables show the new rows. */
export async function finishImportAction(summary: {
  fileName: string;
  duplicateMode: DuplicateMode;
  rowsUploaded: number;
  rowsAdded: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsFailed: number;
}) {
  const session = await requireAdminSession();

  /*
    The listings are already written by the time this runs, so a history that
    cannot be recorded must not be reported as an import that failed. It is
    caught, named and handed back as a warning: the rows are in, and the line
    in the history is not.

    Not swallowed either. Silence is how the history came to be empty in the
    first place.
  */
  let warning: string | null = null;
  try {
    await importHistoryService.record({
      fileName: sanitiseText(summary.fileName, 120),
      adminEmail: session.email,
      duplicateMode: summary.duplicateMode === 'update' ? 'update' : 'skip',
      rowsUploaded: Math.max(0, Math.trunc(summary.rowsUploaded)),
      rowsAdded: Math.max(0, Math.trunc(summary.rowsAdded)),
      rowsUpdated: Math.max(0, Math.trunc(summary.rowsUpdated)),
      rowsSkipped: Math.max(0, Math.trunc(summary.rowsSkipped)),
      rowsFailed: Math.max(0, Math.trunc(summary.rowsFailed)),
    });
  } catch (error) {
    console.error('Could not record the import run', error);
    warning =
      'The listings were imported, but this run could not be written to the ' +
      'import history, so it will not appear in the list below.';
  }

  revalidatePath('/admin/websites');
  revalidatePath('/marketplace');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');

  return { warning };
}

/** Domains already in the marketplace, for duplicate detection in the browser. */
export async function getExistingDomainsAction(): Promise<Record<string, string>> {
  await requireAdminSession();
  return websiteService.getDomainIndex();
}
