import Link from 'next/link';
import { AlertCircle, Inbox } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SourcingControls } from '@/components/admin/sourcing/sourcing-controls';
import { DraftsTable } from '@/components/admin/sourcing/drafts-table';
import { sourcingService } from '@/lib/services/sourcing-service';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * The publisher inbox.
 *
 * Emails in on the left of the workflow, drafts awaiting a human on the
 * right. Nothing on this page is customer-facing and nothing on it reaches a
 * listing: approving a draft does that, one draft at a time, deliberately.
 */

export interface DraftRow {
  id: string;
  domain: string;
  fromAddress: string;
  sentAt: string | null;
  matched: boolean;
  lowConfidenceCount: number;
  flags: string[];
}

async function load() {
  if (!isSupabaseEnabled()) {
    return { ready: false as const, reason: 'The database is not connected on this deployment.' };
  }

  const supabase = getAdminScopedClient();

  const [settings, pending, spent, drafts, emails, problems, batches] = await Promise.all([
    sourcingService.getSettings(),
    sourcingService.pendingCount().catch(() => 0),
    sourcingService.spentThisMonthUsd().catch(() => 0),
    supabase
      .from('listing_drafts')
      .select('id, domain, matched_website_id, low_confidence_count, flags, created_at, inbound_emails (from_address, sent_at)')
      .eq('status', 'pending')
      .order('low_confidence_count', { ascending: true })
      .limit(200),
    supabase.from('inbound_emails').select('status'),
    supabase
      .from('inbound_emails')
      .select('id, from_address, subject, status, status_reason, sent_at')
      .in('status', ['failed', 'ignored'])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('extraction_batches')
      .select('id, mode, status, email_count, succeeded_count, failed_count, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // The settings read is the canary: if 0019 has not been run, every query
  // above failed the same way and saying so once is more use than six blanks.
  if (settings.reason && !settings.configured) {
    // Configured is about the key, not the schema - keep both reasons visible.
  }

  const emailRows = (emails.data ?? []) as { status: string }[];
  const counts = emailRows.reduce<Record<string, number>>((all, row) => {
    all[row.status] = (all[row.status] ?? 0) + 1;
    return all;
  }, {});

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const draftRows: DraftRow[] = ((drafts.data ?? []) as any[]).map((row) => {
    const email = Array.isArray(row.inbound_emails) ? row.inbound_emails[0] : row.inbound_emails;
    return {
      id: row.id,
      domain: row.domain,
      fromAddress: email?.from_address ?? '',
      sentAt: email?.sent_at ?? null,
      matched: Boolean(row.matched_website_id),
      lowConfidenceCount: row.low_confidence_count ?? 0,
      flags: row.flags ?? [],
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return {
    ready: true as const,
    settings,
    pending,
    spent,
    counts,
    drafts: draftRows,
    problems: (problems.data ?? []) as Record<string, unknown>[],
    batches: (batches.data ?? []) as Record<string, unknown>[],
    schemaError: drafts.error?.message ?? emails.error?.message ?? null,
  };
}

function ProblemEmails({ rows }: { rows: Record<string, unknown>[] }) {
  const failed = rows.filter((row) => row.status === 'failed');
  const ignored = rows.filter((row) => row.status === 'ignored');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emails that produced no draft</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-negative">
              Failed - these can be read again once the cause is fixed
            </p>
            <ul className="space-y-1.5">
              {failed.map((row) => (
                <li key={String(row.id)} className="text-[13px]">
                  <span className="font-medium text-ink">{String(row.from_address)}</span>
                  <span className="block text-[12px] leading-snug text-negative">
                    {String(row.status_reason ?? 'No reason recorded.')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {ignored.length > 0 ? (
          <div className={failed.length > 0 ? 'border-t border-line pt-3' : ''}>
            <p className="mb-1.5 text-[12px] font-medium text-muted">
              Nothing usable in them - this is a normal outcome, not an error
            </p>
            <ul className="space-y-1">
              {ignored.map((row) => (
                <li key={String(row.id)} className="text-[12px] text-muted">
                  <span className="text-ink-soft">{String(row.from_address)}</span> -{' '}
                  {String(row.status_reason ?? 'no reason recorded')}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default async function SourcingPage() {
  const state = await load();

  if (!state.ready) {
    return (
      <div className="space-y-5">
        <PageTitle title="Publisher inbox" description="Turn publisher replies into listings." />
        <Card>
          <CardContent className="py-8 text-center text-[13px] text-muted">{state.reason}</CardContent>
        </Card>
      </div>
    );
  }

  const { settings, counts, drafts, schemaError } = state;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Publisher inbox"
        description="Paste a reply or upload a mailbox export, read it with Claude, then check every draft before it becomes a listing."
      />

      {schemaError ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-4 text-[13px] text-negative">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {schemaError}. If this mentions a missing table, migration{' '}
              <code className="rounded bg-surface-sunken px-1">0019_publisher_sourcing.sql</code> has
              not been run yet.
            </span>
          </CardContent>
        </Card>
      ) : null}

      <SourcingControls
        settings={settings}
        pending={state.pending}
        spentUsd={state.spent}
        counts={counts}
        batches={state.batches}
      />

      {/*
        Why an email did not become a draft, in the admin's face rather than
        in a column only a database query would show. A count of failures
        with no reason attached is the one thing worse than the failure.
      */}
      {state.problems.length > 0 ? <ProblemEmails rows={state.problems} /> : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            Waiting for review
            <span className="ml-2 text-[13px] font-normal text-muted">
              {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
            </span>
          </CardTitle>
          {counts.ignored ? (
            <Badge tone="neutral">{counts.ignored} emails had nothing usable</Badge>
          ) : null}
        </CardHeader>
        <CardContent>
          {drafts.length === 0 ? (
            <div className="py-10 text-center">
              <Inbox className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
              <p className="mt-2 text-[13px] text-muted">
                Nothing waiting. Upload an export or paste a reply above, then read it.
              </p>
            </div>
          ) : (
            <DraftsTable drafts={drafts} />
          )}
        </CardContent>
      </Card>

      <p className="text-[12px] text-muted">
        Nothing on this page is visible to customers, and no draft changes a listing until you
        approve it. Approved listings start unpublished until you set a sell price on{' '}
        <Link href="/admin/websites" className="text-accent-700 hover:underline">
          Websites
        </Link>
        .
      </p>
    </div>
  );
}
