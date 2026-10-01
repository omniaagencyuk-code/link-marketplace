import Link from 'next/link';
import { AlertCircle, Inbox } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SourcingControls } from '@/components/admin/sourcing/sourcing-controls';
import { DraftsTable } from '@/components/admin/sourcing/drafts-table';
import { sourcingService } from '@/lib/services/sourcing-service';
import { getAdminScopedClient } from '@/lib/supabase/server';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/*
  Real-time extraction runs inside a server action on this route, one model
  call after another. Eleven threads came back comfortably, but the default
  function ceiling is nowhere near what a longer run needs, and a run killed
  half way leaves its emails claimed by a batch nobody is waiting for.
*/
export const maxDuration = 300;

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

  const [settings, pending, spent, noDrafts, duplicates, drafts, emails, problems, batches] = await Promise.all([
    sourcingService.getSettings(),
    sourcingService.pendingCount().catch(() => 0),
    sourcingService.spentThisMonthUsd().catch(() => 0),
    sourcingService.noDraftEmails(200).catch(() => []),
    sourcingService.duplicateGroups().catch(() => []),
    // Paged and filtered inside the service. Asking for a page and dropping
    // the contested rows afterwards is what made this queue appear to refill
    // forever.
    sourcingService.pendingDrafts(200).catch(() => ({ rows: [], total: 0 })),
    // batch_id too: an email in a running batch is still 'new', and counting
    // it as waiting told the owner 50 were waiting while 25 were in flight -
    // and put 50 on a button that would only ever send the unclaimed ones.
    supabase.from('inbound_emails').select('status, batch_id'),
    supabase
      .from('inbound_emails')
      .select('id, from_address, subject, status, status_reason, sent_at')
      .in('status', ['failed', 'ignored'])
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('extraction_batches')
      .select('id, mode, status, email_count, succeeded_count, failed_count, created_at, provider_batch_id, status_reason')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  // The settings read is the canary: if 0019 has not been run, every query
  // above failed the same way and saying so once is more use than six blanks.
  if (settings.reason && !settings.configured) {
    // Configured is about the key, not the schema - keep both reasons visible.
  }

  const emailRows = (emails.data ?? []) as { status: string; batch_id: string | null }[];
  const counts = emailRows.reduce<Record<string, number>>((all, row) => {
    // Unread but claimed is its own state, and the one worth showing: it is
    // what somebody is waiting on, and it is not something to press the
    // button about.
    const key = row.status === 'new' && row.batch_id ? 'in-flight' : row.status;
    all[key] = (all[key] ?? 0) + 1;
    return all;
  }, {});

  /*
    A domain two replies offer is not review work, it is a comparison, and it
    has a page of its own. Kept out of this list rather than flagged in it:
    the flag was right and useless - it sat in a queue of two hundred that
    somebody wanted to tick straight through, and bulk approve walked past it
    anyway, overwriting one offer's price and contact with the other's.
  */
  const draftRows: DraftRow[] = drafts.rows;

  return {
    ready: true as const,
    settings,
    pending,
    spent,
    noDraftCount: noDrafts.length,
    duplicateDomains: duplicates.length,
    duplicateDrafts: duplicates.reduce((total, group) => total + group.pending, 0),
    counts,
    drafts: draftRows,
    draftsWaiting: drafts.total,
    problems: (problems.data ?? []) as Record<string, unknown>[],
    batches: (batches.data ?? []) as Record<string, unknown>[],
    schemaError: emails.error?.message ?? null,
  };
}

function ProblemEmails({
  rows,
  noDraftCount,
}: {
  rows: Record<string, unknown>[];
  noDraftCount: number;
}) {
  const failed = rows.filter((row) => row.status === 'failed');

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

        {/*
          The ones with nothing usable used to be listed here, unactionably.
          They have a worklist of their own now, and listing them twice means
          somebody works through one copy while the other still shows them.
        */}
        {noDraftCount > 0 ? (
          <div className={failed.length > 0 ? 'border-t border-line pt-3' : ''}>
            <p className="text-[12px] leading-relaxed text-muted">
              {noDraftCount} {noDraftCount === 1 ? 'reply' : 'replies'} produced no draft - a normal
              outcome, not an error. They answered, so they are worth a look:{' '}
              <Link href="/admin/sourcing/no-drafts" className="text-accent-700 underline">
                work through them
              </Link>
              .
            </p>
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

  const { settings, counts, drafts, draftsWaiting, schemaError } = state;

  return (
    <div className="space-y-5">
      <PageTitle
        title="Publisher inbox"
        description="Import replies from Gmail, paste one, or upload an export. Read them with Claude, then check every draft before it becomes a listing."
        action={
          <div className="flex flex-wrap gap-2">
            {state.duplicateDomains > 0 ? (
              <Button asChild variant="outline">
                <Link href="/admin/sourcing/duplicates">
                  {state.duplicateDomains} offered twice
                </Link>
              </Button>
            ) : null}
            {state.noDraftCount > 0 ? (
              <Button asChild variant="outline">
                <Link href="/admin/sourcing/no-drafts">
                  {state.noDraftCount} to follow up
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/admin/sourcing/gmail">Import from Gmail</Link>
            </Button>
          </div>
        }
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
      {state.problems.length > 0 || state.noDraftCount > 0 ? (
        <ProblemEmails rows={state.problems} noDraftCount={state.noDraftCount} />
      ) : null}

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            Waiting for review
            <span className="ml-2 text-[13px] font-normal text-muted">
              {/* The number waiting, and the number on screen when those
                  differ. They used to be one number, which was the length of
                  a list that had already been cut down - so the queue never
                  admitted how much was behind it. */}
              {draftsWaiting > drafts.length
                ? `${drafts.length} of ${draftsWaiting} drafts`
                : `${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}`}
            </span>
          </CardTitle>
          {counts.ignored ? (
            <Badge tone="neutral">{counts.ignored} emails had nothing usable</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {state.duplicateDrafts > 0 ? (
            <p className="rounded-lg border border-line bg-surface-sunken px-3 py-2 text-[13px] text-ink-soft">
              {state.duplicateDrafts} more {state.duplicateDrafts === 1 ? 'draft is' : 'drafts are'}{' '}
              held back because {state.duplicateDomains === 1 ? 'its domain is' : 'their domains are'}{' '}
              offered by more than one person.{' '}
              <Link href="/admin/sourcing/duplicates" className="text-accent-700 underline">
                Compare them
              </Link>{' '}
              whenever you have time - approving in bulk here will not touch them.
            </p>
          ) : null}
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
