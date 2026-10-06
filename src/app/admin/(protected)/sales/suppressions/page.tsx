import { ShieldOff } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SalesForm } from '@/components/admin/sales-controls';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';
import { formatDate } from '@/lib/utils/format';
import { suppressAction } from '../actions';
import type { SalesSuppression } from '@/lib/types/sales';

/**
 * The do-not-contact list.
 *
 * Read-only on purpose. There is no button here that removes a suppression,
 * and that is the design rather than an omission: an unsubscribe we can undo
 * with a click is not an unsubscribe, and the person who would click it is
 * always under pressure to hit a number this month.
 *
 * Removing one needs a deliberate `delete from sales_suppressions` in the SQL
 * editor by somebody who has decided to do it. If that feels like friction,
 * it is the right amount.
 *
 * A trigger on `outbound_emails` reads this table, so a row here makes a send
 * to that address impossible rather than unlikely - including for every email
 * already approved and sitting in the queue.
 */

export const dynamic = 'force-dynamic';

async function suppressions(): Promise<SalesSuppression[]> {
  if (!isSupabaseEnabled()) return [];

  const { data } = await getAdminScopedClient()
    .from('sales_suppressions')
    .select('id, email, domain, reason, note, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  return (data ?? []).map((row) => {
    const entry = row as Record<string, unknown>;
    return {
      id: String(entry.id),
      email: (entry.email as string) ?? undefined,
      domain: (entry.domain as string) ?? undefined,
      reason: entry.reason as SalesSuppression['reason'],
      note: (entry.note as string) ?? undefined,
      createdBy: (entry.created_by as string) ?? undefined,
      createdAt: String(entry.created_at),
    };
  });
}

export default async function SuppressionsPage() {
  const rows = await suppressions().catch(() => []);

  return (
    <>
      <PageTitle
        title="Do not contact"
        description="Addresses and whole companies that will never receive an email from us again."
      />

      <Card className="mb-6">
        <CardContent className="py-5">
          <SalesForm
            action={suppressAction}
            submitLabel="Add to the list"
            confirm="Add this to the do-not-contact list? There is no button on this page that removes one."
          >
            <div className="max-w-md">
              <Label htmlFor="value">Address or domain</Label>
              <div className="mt-1.5">
                <Input id="value" name="value" placeholder="maria@example.com or example.com" />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                A domain covers everybody at that company. An address covers one person. Either
                makes a send impossible from the moment it is saved - a trigger on the email table
                reads this list, so every email already approved for them is refused too.
              </p>
            </div>
          </SalesForm>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">
        On the list
        <span className="ml-2 text-[13px] font-normal text-muted">{rows.length}</span>
      </h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldOff}
          title="Nobody yet"
          description="Unsubscribes land here automatically, as whole companies rather than single addresses."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Who</Th>
                    <Th>Scope</Th>
                    <Th>Why</Th>
                    <Th>Added</Th>
                  </Tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Tr key={row.id}>
                      <Td className="font-medium text-ink">{row.email ?? row.domain}</Td>
                      <Td>
                        <Badge tone={row.domain ? 'navy' : 'outline'}>
                          {row.domain ? 'whole company' : 'one address'}
                        </Badge>
                      </Td>
                      <Td className="text-[13px] text-ink-soft">{row.reason.replace(/_/g, ' ')}</Td>
                      <Td className="text-[12px] text-muted">
                        {formatDate(row.createdAt)}
                        {row.createdBy ? ` - ${row.createdBy}` : ''}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      )}

      <p className="mt-4 max-w-2xl text-[12px] leading-relaxed text-muted">
        There is deliberately no remove button. Taking somebody off this list needs a considered{' '}
        <code className="rounded bg-surface-sunken px-1">delete from sales_suppressions</code> in
        the SQL editor - an unsubscribe that can be undone with one click is not an unsubscribe.
      </p>
    </>
  );
}
