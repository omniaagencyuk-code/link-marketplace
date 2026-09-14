import { importFields, type ImportFieldKey } from './fields';

/** A CSV header, and the field it will be imported into. */
export interface ColumnMapping {
  header: string;
  /** null means "ignore this column". */
  field: ImportFieldKey | null;
  /** True when the importer guessed rather than the admin choosing. */
  auto: boolean;
}

function canonical(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Guess a destination field for each CSV header.
 *
 * Exact alias matches win; a header that merely contains an alias is used only
 * as a fallback, and each field is claimed at most once so two columns never
 * fight over the same destination.
 */
export function autoMapColumns(headers: string[]): ColumnMapping[] {
  const taken = new Set<ImportFieldKey>();
  const mappings: ColumnMapping[] = headers.map((header) => ({ header, field: null, auto: false }));

  const assign = (index: number, field: ImportFieldKey) => {
    mappings[index] = { header: headers[index] as string, field, auto: true };
    taken.add(field);
  };

  // Pass one: exact alias or key match.
  headers.forEach((header, index) => {
    const name = canonical(header);
    if (!name) return;
    const match = importFields.find(
      (field) =>
        !taken.has(field.key) &&
        (canonical(field.key) === name || field.aliases.some((alias) => canonical(alias) === name)),
    );
    if (match) assign(index, match.key);
  });

  // Pass two: header contains an alias, e.g. "Guest Post Price (GBP)".
  headers.forEach((header, index) => {
    if (mappings[index]?.field) return;
    const name = canonical(header);
    if (!name) return;
    const match = importFields.find(
      (field) =>
        !taken.has(field.key) &&
        field.aliases.some((alias) => {
          const candidate = canonical(alias);
          // Require a word boundary so "pr" does not match "price".
          return candidate.length > 2 && new RegExp(`(^| )${candidate}( |$)`).test(name);
        }),
    );
    if (match) assign(index, match.key);
  });

  return mappings;
}

/** Fields that have no column pointing at them. */
export function unmappedRequiredFields(mappings: ColumnMapping[]): ImportFieldKey[] {
  const mapped = new Set(mappings.map((mapping) => mapping.field).filter(Boolean));
  return importFields.filter((field) => field.required && !mapped.has(field.key)).map((f) => f.key);
}
