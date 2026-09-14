import { History } from 'lucide-react';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { formatDateTime } from '@/lib/utils/format';
import type { ImportRun } from '@/lib/services';

/** Recent bulk imports, so repeated uploads leave a trail. */
export function ImportHistory({ runs }: { runs: ImportRun[] }) {
  if (runs.length === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="import-history">
      <h2
        id="import-history"
        className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-ink"
      >
        <History className="h-4 w-4 text-muted" aria-hidden="true" />
        Recent imports
      </h2>

      <TableWrap>
        <Table>
          <caption className="sr-only">Recent CSV imports</caption>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>File</Th>
              <Th className="hidden sm:table-cell">Admin</Th>
              <Th className="text-right">Uploaded</Th>
              <Th className="text-right">Added</Th>
              <Th className="text-right">Updated</Th>
              <Th className="text-right">Skipped</Th>
              <Th className="text-right">Failed</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <Tr key={run.id}>
                <Td className="tabular text-[13px] whitespace-nowrap text-muted">
                  {formatDateTime(run.createdAt)}
                </Td>
                <Td className="max-w-56 truncate text-[13px] font-medium text-ink">
                  {run.fileName}
                </Td>
                <Td className="hidden max-w-48 truncate text-[13px] text-ink-soft sm:table-cell">
                  {run.adminEmail}
                </Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">{run.rowsUploaded}</Td>
                <Td className="tabular text-right text-[13px] font-semibold text-accent-700">
                  {run.rowsAdded}
                </Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">{run.rowsUpdated}</Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">{run.rowsSkipped}</Td>
                <Td className="tabular text-right text-[13px] text-ink-soft">
                  {run.rowsFailed > 0 ? (
                    <span className="text-negative">{run.rowsFailed}</span>
                  ) : (
                    run.rowsFailed
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </section>
  );
}
