import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Mail, Search, Sparkles, UserSearch } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SalesAction } from '@/components/admin/sales-controls';
import { ProspectContacts, ProspectStagePicker } from '@/components/admin/prospect-panels';
import { prospectService } from '@/lib/services/prospect-service';
import { salesEmailService } from '@/lib/services/sales-email-service';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { segmentDefinition } from '@/lib/config/sales-segments';
import { isHunterConfigured } from '@/lib/sales/hunter-config';
import { formatDate } from '@/lib/utils/format';
import {
  draftEmailAction,
  findContactsAction,
  qualifyProspectAction,
  researchProspectAction,
} from '../../actions';

/**
 * One prospect, and the evidence behind every judgement about them.
 *
 * The page is laid out as a chain: what their site says, what the model made
 * of it, who we can write to, what we wrote, and what happened. Each stage
 * shows what the next one was built on, so a wrong email can be traced back to
 * the sentence that caused it rather than argued about.
 *
 * Quotes are shown as quotes, with the page they came from. Every one of them
 * has already been checked against the text the model was given - an unquoted
 * or invented claim never reaches this page - so what is here is what somebody
 * at that company actually wrote.
 */

export const dynamic = 'force-dynamic';

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const prospect = await prospectService.getById(id).catch(() => null);
  if (!prospect) notFound();

  const [pages, qualifications, contacts, emails, settings] = await Promise.all([
    prospectService.pages(id).catch(() => []),
    prospectService.qualifications(id).catch(() => []),
    prospectService.contacts(id).catch(() => []),
    salesEmailService.forProspect(id).catch(() => []),
    salesSettingsService.get().catch(() => null),
  ]);

  const events = await prospectService.events(id, 40).catch(() => []);
  const latest = qualifications[0];
  const recipient = contacts.find((contact) => contact.selected);
  const definition = segmentDefinition(prospect.segment);
  const enabled = settings?.enabled ?? false;
  const dryRun = settings?.dryRun ?? true;

  return (
    <>
      <PageTitle
        title={prospect.companyName}
        description={`${definition.label} - ${prospect.domain}`}
        action={
          <a
            href={`https://${prospect.domain}/`}
            target="_blank"
            rel="noreferrer nofollow"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-2 text-[13px] font-medium text-ink"
          >
            Their site
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={prospect.qualified ? 'accent' : prospect.qualified === false ? 'negative' : 'neutral'}>
                {prospect.qualified === undefined
                  ? 'not qualified yet'
                  : prospect.qualified
                    ? 'qualified'
                    : 'not a buyer'}
              </Badge>
              <Badge tone="outline">{prospect.stage.replace(/_/g, ' ')}</Badge>
              {prospect.score !== undefined ? (
                <Badge tone="navy">score {prospect.score}</Badge>
              ) : null}
            </div>

            {/*
              The score's components, shown rather than summarised.

              A score nobody can account for is a score people ignore, so the
              arithmetic is on the page: this is what the number is made of.
            */}
            {prospect.score !== undefined ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                {Object.entries(prospect.scoreBreakdown).map(([part, value]) => (
                  <span key={part} className="text-[12px] text-muted">
                    {part} <span className="tabular font-semibold text-ink">{value}</span>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-start gap-2 border-t border-line pt-4">
              <SalesAction
                action={researchProspectAction}
                args={[id]}
                label={prospect.researchStatus === 'done' ? 'Re-read their site' : 'Read their site'}
                icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
                disabled={!enabled}
                disabledReason={!enabled ? 'Outbound is off.' : undefined}
              />
              <SalesAction
                action={qualifyProspectAction}
                args={[id]}
                label={latest ? 'Qualify again' : 'Qualify'}
                icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
                disabled={!enabled || prospect.researchStatus !== 'done'}
                disabledReason={
                  prospect.researchStatus !== 'done' ? 'Read their site first.' : !enabled ? 'Outbound is off.' : undefined
                }
              />
              <SalesAction
                action={findContactsAction}
                args={[id]}
                label="Find contacts"
                icon={<UserSearch className="h-3.5 w-3.5" aria-hidden="true" />}
                confirm="This spends one Hunter credit. Continue?"
                disabled={!enabled || dryRun || !isHunterConfigured()}
                disabledReason={
                  dryRun
                    ? 'Dry run refuses Hunter lookups.'
                    : !isHunterConfigured()
                      ? 'No Hunter key on this deployment.'
                      : !enabled
                        ? 'Outbound is off.'
                        : undefined
                }
              />
              <SalesAction
                action={draftEmailAction}
                args={[id]}
                label="Write an email"
                icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
                disabled={!enabled || !recipient}
                disabledReason={!recipient ? 'No recipient chosen yet.' : !enabled ? 'Outbound is off.' : undefined}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4">
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Pipeline</h2>
            <ProspectStagePicker prospectId={id} stage={prospect.stage} />
            <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-[12px]">
              <Row label="Source" value={prospect.sourceDetail ?? prospect.source} />
              <Row label="Added" value={formatDate(prospect.createdAt)} />
              {prospect.lastContactedAt ? (
                <Row label="Last contacted" value={formatDate(prospect.lastContactedAt)} />
              ) : null}
              {prospect.lastReplyAt ? (
                <Row label="Last reply" value={formatDate(prospect.lastReplyAt)} />
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------- what they said */}
      <h2 className="mb-3 text-[15px] font-semibold text-ink">What their site says</h2>
      <Card className="mb-6">
        <CardContent className="py-4">
          {prospect.researchStatus === 'pending' ? (
            <p className="text-[13px] text-muted">Not read yet.</p>
          ) : prospect.researchStatus === 'failed' ? (
            <p className="text-[13px] text-coral-900">
              Could not read it: {prospect.researchError ?? 'no usable pages'}.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
                <span>{pages.filter((page) => !page.error).length} pages read</span>
                {prospect.signals.hasServicesPage ? <span>has a services page</span> : null}
                {prospect.signals.hasPricingPage ? <span>has a pricing page</span> : null}
                {prospect.signals.hasBlog ? <span>has a blog</span> : null}
              </div>

              {(prospect.signals.matchedTerms ?? []).length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[12px] font-semibold text-ink">
                    Phrases found in their own copy
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {(prospect.signals.matchedTerms ?? []).map((entry) => (
                      <li key={entry.term}>
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-[12px] text-ink-soft hover:underline"
                        >
                          {entry.term}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-[13px] text-muted">
                  None of the phrases we track appeared. That is not evidence against them - most
                  companies that buy links never mention it.
                </p>
              )}

              <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
                {pages.map((page) => (
                  <li key={page.id} className="text-[12px]">
                    <a
                      href={page.url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="text-ink hover:underline"
                    >
                      {page.kind}
                    </a>{' '}
                    <span className="text-muted">
                      {page.error ? `- ${page.error}` : `- ${page.textExcerpt.length} characters read`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- what we made of it */}
      <h2 className="mb-3 text-[15px] font-semibold text-ink">What we made of it</h2>
      <Card className="mb-6">
        <CardContent className="py-4">
          {!latest ? (
            <p className="text-[13px] text-muted">Not qualified yet.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    latest.verdict === 'likely_buyer'
                      ? 'accent'
                      : latest.verdict === 'unlikely'
                        ? 'negative'
                        : 'neutral'
                  }
                >
                  {latest.verdict.replace(/_/g, ' ')}
                </Badge>
                <span className="text-[12px] text-muted">
                  {latest.confidence}% confident - {latest.model}, {latest.promptVersion},{' '}
                  {formatDate(latest.createdAt)}
                </span>
              </div>

              {latest.reasons.length === 0 && latest.buyingSignals.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted">
                  Nothing quotable. The model found no sentence on their site it could point at, so
                  no reason is recorded - which is why the score is low rather than the verdict
                  being negative.
                </p>
              ) : null}

              {latest.reasons.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-1.5 text-[12px] font-semibold text-ink">Why</p>
                  <Quotes entries={latest.reasons} />
                </div>
              ) : null}

              {latest.buyingSignals.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-1.5 text-[12px] font-semibold text-ink">
                    Signs they are investing in this now
                  </p>
                  <Quotes entries={latest.buyingSignals} />
                </div>
              ) : null}

              {qualifications.length > 1 ? (
                <p className="mt-4 border-t border-line pt-3 text-[12px] text-muted">
                  {qualifications.length} readings in all. The older ones are kept so a changed
                  prompt can be checked against what it used to say.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------- contacts */}
      <h2 className="mb-3 text-[15px] font-semibold text-ink">Who we would write to</h2>
      <ProspectContacts prospectId={id} contacts={contacts} />

      {/* ------------------------------------------------------------- emails */}
      {emails.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">Emails</h2>
          <Card className="mb-6">
            <CardContent className="py-4">
              <ul className="space-y-4">
                {emails.map((email) => (
                  <li key={email.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={email.status === 'sent' ? 'accent' : 'outline'}>
                        {email.status.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-[12px] text-muted">
                        step {email.stepNumber} - {email.toAddress}
                      </span>
                      {email.status === 'needs_review' ? (
                        <Link href="/admin/sales/review" className="text-[12px] text-ink underline">
                          review it
                        </Link>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-ink">{email.subject}</p>
                    {email.statusReason ? (
                      <p className="mt-1 rounded bg-coral-50 px-2 py-1 text-[12px] text-coral-900">
                        {email.statusReason}
                      </p>
                    ) : null}
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface-sunken p-2.5 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink-soft">
                      {email.bodyText}
                    </pre>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ----------------------------------------------------------- timeline */}
      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">Everything that happened</h2>
      <Card>
        <CardContent className="py-4">
          {events.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="tabular text-[12px] text-muted">
                    {formatDate(event.createdAt)}
                  </span>
                  <span className="text-ink">{event.summary}</span>
                  {event.actor ? (
                    <span className="text-[12px] text-muted">- {event.actor}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Quotes({ entries }: { entries: { claim: string; quote: string; url?: string }[] }) {
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => (
        <li key={index} className="text-[13px]">
          <p className="text-ink">{entry.claim}</p>
          <blockquote className="mt-0.5 border-l-2 border-line-strong pl-2.5 text-[12px] leading-relaxed text-muted italic">
            &ldquo;{entry.quote}&rdquo;
            {entry.url ? (
              <>
                {' '}
                <a href={entry.url} target="_blank" rel="noreferrer nofollow" className="not-italic underline">
                  source
                </a>
              </>
            ) : null}
          </blockquote>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{value}</dd>
    </div>
  );
}
