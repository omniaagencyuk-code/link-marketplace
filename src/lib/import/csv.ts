import Papa from 'papaparse';
import { defuseFormula } from '@/lib/admin/export-csv';
import { downloadTextFile } from '@/lib/admin/download';
import { templateExampleRow, templateHeaders } from './fields';

/** Upload limits, surfaced in the UI so they are never a surprise. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 10_000;

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  /** Rows dropped because the file exceeded MAX_ROWS. */
  truncated: number;
}

/**
 * Parse an uploaded CSV.
 *
 * Papa Parse handles quoted values, embedded commas and newlines, mixed line
 * endings and UTF-8 (including a byte order mark), which hand-rolled splitting
 * does not.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const headers = (results.meta.fields ?? []).filter(Boolean);
        const all = results.data.filter((row) =>
          Object.values(row).some((value) => (value ?? '').toString().trim() !== ''),
        );
        const rows = all.slice(0, MAX_ROWS).map((row) => {
          const clean: Record<string, string> = {};
          for (const header of headers) clean[header] = (row[header] ?? '').toString();
          return clean;
        });
        resolve({ headers, rows, truncated: Math.max(0, all.length - rows.length) });
      },
      error: (error: Error) => reject(error),
    });
  });
}

/**
 * The same escaping and the same download as the website export uses.
 *
 * There were two copies of both for a while, which is how a rule about
 * leading = and + comes to be fixed in one file and not the other. Papa Parse
 * still does the quoting here, because it is already the reader above's
 * dependency; only the formula guard is shared, that one being a security
 * rule rather than a formatting choice.
 */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return Papa.unparse(
    {
      fields: headers,
      data: rows.map((row) => row.map((cell) => defuseFormula(String(cell)))),
    },
    { quotes: true },
  );
}

export function downloadCsv(fileName: string, contents: string) {
  downloadTextFile(fileName, contents);
}

/** The downloadable template: headers plus one example row. */
export function buildTemplateCsv(): string {
  return toCsv(
    templateHeaders,
    [templateHeaders.map((header) => templateExampleRow[header] ?? '')],
  );
}
