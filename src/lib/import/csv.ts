import Papa from 'papaparse';
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
 * Neutralise spreadsheet formula injection.
 *
 * A cell beginning =, +, - or @ is executed by Excel and Sheets when the file
 * is opened, so prefix those with a single quote before writing any CSV.
 */
function escapeCsvCell(value: string): string {
  const text = String(value ?? '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return Papa.unparse(
    {
      fields: headers,
      data: rows.map((row) => row.map((cell) => escapeCsvCell(String(cell)))),
    },
    { quotes: true },
  );
}

/** Trigger a download in the browser without needing a server round trip. */
export function downloadCsv(fileName: string, contents: string) {
  // The BOM keeps Excel happy with UTF-8 accents.
  const blob = new Blob([`﻿${contents}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** The downloadable template: headers plus one example row. */
export function buildTemplateCsv(): string {
  return toCsv(
    templateHeaders,
    [templateHeaders.map((header) => templateExampleRow[header])],
  );
}
