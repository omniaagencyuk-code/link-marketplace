import { Megaphone } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SalesAction } from '@/components/admin/sales-controls';
import { NewCampaign } from '@/components/admin/new-campaign';
import { salesCampaignService } from '@/lib/services/sales-campaign-service';
import { salesSettingsService } from '@/lib/services/sales-settings-service';
import { segmentLabel } from '@/lib/config/sales-segments';
import { formatDate } from '@/lib/utils/format';
import { runCampaignAction, setCampaignStatusAction } from '../actions';

/**
 * Campaigns.
 *
 * A filter, an angle, and a record of who was written to under it - so one
 * run can be compared with the next and the angle changed on evidence rather
 * than on taste.
 *
 * Running one fills the review queue and nothing more. There is no bulk
 * approve on this page and that omission is the feature: a batch is exactly
 * where a bad angle multiplies, and the thing that would be obvious on one
 * email goes out forty times when the queue is skipped.
 */

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const [campaigns, settings] = await Promise.all([
    salesCampaignService.list().catch(() => []),
    salesSettingsService.get().catch(() => null),
  ]);

  const progress = await Promise.all(
    campaigns.map((campaign) => salesCampaignService.progress(campaign.id).catch(() => null)),
  );

  const enabled = settings?.enabled ?? false;

  return (
    <>
      <PageTitle
        title="Campaigns"
        description="A batch of drafts aimed at one kind of buyer. Running one fills the review queue; it never sends."
      />

      <NewCampaign />

      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">
        All campaigns
        <span className="ml-2 text-[13px] font-normal text-muted">{campaigns.length}</span>
      </h2>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="One per angle. The angle is guidance for the writer, not copy - each email is still written from that company's own site and our inventory."
        />
      ) : (
        <ul className="space-y-4">
          {campaigns.map((campaign, index) => {
            const counts = progress[index];
            const replyRate =
              counts && counts.sent > 0
                ? Math.round((counts.replied / counts.sent) * 1000) / 10
                : undefined;

            return (
              <li key={campaign.id}>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-semibold text-ink">{campaign.name}</span>
                          <Badge tone={campaign.status === 'active' ? 'accent' : 'outline'}>
                            {campaign.status}
                          </Badge>
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted">
                          {campaign.segment ? segmentLabel(campaign.segment) : 'Any segment'}
                          {campaign.minScore !== undefined ? `, score ${campaign.minScore}+` : ''}
                          {' - created '}
                          {formatDate(campaign.createdAt)}
                        </p>
                        {campaign.angle ? (
                          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
                            {campaign.angle}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-start gap-2">
                        <SalesAction
                          action={runCampaignAction}
                          args={[campaign.id, 20]}
                          label="Draft 20"
                          busyLabel="Writing..."
                          variant="primary"
                          disabled={!enabled}
                          disabledReason={!enabled ? 'Outbound is off.' : undefined}
                          confirm="Write up to 20 emails for this campaign? They go to the review queue and nothing is sent."
                        />
                        <SalesAction
                          action={setCampaignStatusAction}
                          args={[campaign.id, campaign.status === 'active' ? 'paused' : 'active']}
                          label={campaign.status === 'active' ? 'Pause' : 'Activate'}
                        />
                      </div>
                    </div>

                    {counts ? (
                      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-[12px]">
                        <Figure label="In review" value={counts.drafted} />
                        <Figure label="Approved" value={counts.approved} />
                        <Figure label="Sent" value={counts.sent} />
                        <Figure label="Replied" value={counts.replied} />
                        <Figure
                          label="Reply rate"
                          value={replyRate !== undefined ? `${replyRate}%` : '-'}
                        />
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: number | string }) {
  return (
    <span className="text-muted">
      {label} <span className="tabular font-semibold text-ink">{value}</span>
    </span>
  );
}
