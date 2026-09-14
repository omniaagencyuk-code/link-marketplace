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

  revalidatePath('/admin/websites');
  revalidatePath('/websites');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
}

/** Domains already in the marketplace, for duplicate detection in the browser. */
export async function getExistingDomainsAction(): Promise<Record<string, string>> {
  await requireAdminSession();
  return websiteService.getDomainIndex();
}
