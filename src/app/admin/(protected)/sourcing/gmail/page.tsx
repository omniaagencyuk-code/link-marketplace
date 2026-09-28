import Link from 'next/link';
import { PageTitle } from '@/components/dashboard/page-title';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { MailboxAllowlist } from '@/components/admin/sourcing/gmail/mailbox-allowlist';
import { ImportControls } from '@/components/admin/sourcing/gmail/import-controls';
import { NightlySchedule } from '@/components/admin/sourcing/gmail/nightly-schedule';
import { gmailImportService, QUERY_PRESETS } from '@/lib/services/gmail-import-service';
import { sourcingService } from '@/lib/services/sourcing-service';
import { isSupabaseEnabled } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

/**
 * Importing publisher replies straight from Gmail.
 *
 * The fast route into the same pipeline the uploader feeds. Nothing here
 * reaches a listing: a thread becomes an email waiting to be read, exactly
 * like an uploaded one, and a human still approves every draft.
 */
export default async function GmailImportPage() {
  if (!isSupabaseEnabled()) {
    return (
      <>
        <PageTitle title="Gmail import" description="The database is not connected on this deployment." />
      </>
    );
  }

  const [mailboxes, jobs, config, settings] = await Promise.all([
    gmailImportService.mailboxes(),
    gmailImportService.recentJobs(10),
    Promise.resolve(gmailImportService.configured()),
    sourcingService.getSettings(),
  ]);

  const running = jobs.find((job) => job.status === 'fetching' || job.status === 'listing') ?? null;

  return (
    <>
      <PageTitle
        title="Gmail import"
        description="Read publisher replies straight from the outreach mailboxes, instead of exporting them."
        action={
          <Button asChild variant="outline">
            <Link href="/admin/sourcing">Publisher inbox</Link>
          </Button>
        }
      />

      <div className="mt-5 space-y-5">
        <ImportControls
          mailboxes={mailboxes}
          presets={QUERY_PRESETS}
          configured={config.configured}
          running={running}
        />

        <NightlySchedule
          enabled={settings.nightlyImportEnabled}
          query={settings.nightlyImportQuery}
          cap={settings.nightlyImportCap}
          reads={settings.nightlyImportReads}
          lastRunAt={settings.nightlyImportLastRunAt}
          lastResult={settings.nightlyImportLastResult}
        />

        <MailboxAllowlist mailboxes={mailboxes} />

        {config.configured && config.serviceAccount ? (
          <Card>
            <CardHeader>
              <CardTitle>This deployment&rsquo;s service account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-[12px]">
              <p className="text-muted">
                Grant domain-wide delegation to this account in each Workspace domain, with the
                read-only Gmail scope and nothing else.
              </p>
              <p className="tabular text-ink">{config.serviceAccount}</p>
              {config.clientId ? (
                <p className="tabular text-ink">Client ID {config.clientId}</p>
              ) : null}
              <p className="text-muted">Scope https://www.googleapis.com/auth/gmail.readonly</p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Past imports</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="py-2 text-[13px] text-muted">Nothing imported yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {jobs.map((job) => (
                  <li key={job.id} className="py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] text-ink">
                        {new Date(job.createdAt).toLocaleString('en-GB')}
                        <span className="ml-1.5 text-[12px] text-muted">
                          {job.mailboxes.join(', ')}
                        </span>
                      </span>
                      <Badge tone={badgeFor(job.status)}>{job.status}</Badge>
                    </div>
                    <p className="tabular mt-0.5 text-[12px] text-muted">
                      {job.threadsFound} found &middot; {job.threadsFetched} fetched &middot;{' '}
                      {job.threadsSkipped} skipped &middot; {job.threadsFailed} failed &middot;{' '}
                      {job.emailsCreated} new emails
                    </p>
                    {job.query ? (
                      <p className="mt-0.5 font-mono text-[11px] text-muted">{job.query}</p>
                    ) : null}
                    {job.statusReason ? (
                      <p className="mt-0.5 text-[12px] text-negative">{job.statusReason}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function badgeFor(status: string): BadgeTone {
  if (status === 'done') return 'positive';
  if (status === 'failed') return 'negative';
  if (status === 'fetching' || status === 'listing') return 'info';
  return 'neutral';
}
