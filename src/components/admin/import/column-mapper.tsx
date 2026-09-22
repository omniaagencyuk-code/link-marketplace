'use client';

import { AlertCircle, ArrowRight, Check } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  importFields,
  nicheFromPriceFieldKey,
  type ImportField,
  type ImportFieldKey,
} from '@/lib/import/fields';
import type { ColumnMapping } from '@/lib/import/auto-map';

/** Step 2: confirm where each CSV column lands. */
export function ColumnMapper({
  mappings,
  sampleRow,
  onChange,
  missingRequired,
}: {
  mappings: ColumnMapping[];
  sampleRow?: Record<string, string>;
  onChange: (header: string, field: ImportFieldKey | null) => void;
  missingRequired: ImportFieldKey[];
}) {
  // A destination can only be claimed once, so hide the ones already taken.
  const taken = new Set(mappings.map((mapping) => mapping.field).filter(Boolean));
  const detected = mappings.filter((mapping) => mapping.field).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          <span className="font-medium text-ink">{detected}</span> of {mappings.length} columns
          matched automatically. Change anything that looks wrong, or set a column to Ignore.
        </p>
      </div>

      {missingRequired.length > 0 ? (
        <p role="alert" className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Map a column to {missingRequired.map((key) => `"${key}"`).join(', ')} before continuing.
        </p>
      ) : null}

      <TableWrap>
        <Table>
          <caption className="sr-only">Map CSV columns to marketplace fields</caption>
          <thead>
            <tr>
              <Th className="w-1/3">CSV column</Th>
              <Th className="w-10" />
              <Th className="w-1/3">Press Parrot field</Th>
              <Th>Example value</Th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((mapping) => (
              <Tr key={mapping.header}>
                <Td>
                  <span className="text-[13px] font-medium text-ink">{mapping.header}</span>
                  {mapping.auto && mapping.field ? (
                    <Badge tone="positive" className="ml-2">
                      <Check className="h-3 w-3" aria-hidden="true" />
                      auto
                    </Badge>
                  ) : null}
                </Td>
                <Td className="text-muted">
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Td>
                <Td>
                  <label className="sr-only" htmlFor={`map-${mapping.header}`}>
                    Field for column {mapping.header}
                  </label>
                  <Select
                    id={`map-${mapping.header}`}
                    size="sm"
                    value={mapping.field ?? ''}
                    onChange={(event) =>
                      onChange(mapping.header, (event.target.value || null) as ImportFieldKey | null)
                    }
                  >
                    <option value="">Ignore this column</option>
                    {/* The niche prices are two dozen entries that all end in
                        "price", so they are penned in rather than left to pad
                        out a list someone has to read to the bottom of. */}
                    {standardFields.map((field) => (
                      <FieldOption
                        key={field.key}
                        field={field}
                        taken={taken.has(field.key) && mapping.field !== field.key}
                      />
                    ))}
                    <optgroup label="Prices by niche">
                      {nichePriceFields.map((field) => (
                        <FieldOption
                          key={field.key}
                          field={field}
                          taken={taken.has(field.key) && mapping.field !== field.key}
                        />
                      ))}
                    </optgroup>
                  </Select>
                </Td>
                <Td className="max-w-56 truncate text-[12px] text-muted">
                  {sampleRow?.[mapping.header] || '—'}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}

const standardFields = importFields.filter((field) => !nicheFromPriceFieldKey(field.key));
const nichePriceFields = importFields.filter((field) => nicheFromPriceFieldKey(field.key));

function FieldOption({ field, taken }: { field: ImportField; taken: boolean }) {
  return (
    <option value={field.key} disabled={taken}>
      {field.label}
      {field.required ? ' (required)' : ''}
    </option>
  );
}
