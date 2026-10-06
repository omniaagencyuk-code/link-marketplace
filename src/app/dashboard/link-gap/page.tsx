import Link from 'next/link';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { GapForm } from '@/components/dashboard/gap-form';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { gapService } from '@/lib/services/gap-service';
import { formatDate } from '@/lib/utils/format';
import { brand } from '@/lib/config/brand';

/**
 * The link gap finder.
 *
 * Name your domain and up to three competitors; we find the sites linking to
 * them and not to you, and mark the ones you can buy from us today.
 *
 * The page says how many reports are left before it is asked for, because
 * running out at the point of submitting is the version that wastes somebody's
 * afternoon.
 */

export const metadata: Metadata = {
  title: `Link gap finder | ${brand.name}`,
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LinkGapPage() {
  const user = await requireCustomerSession('/dashboard/link-gap');

  const [settings, spend, recent] = await Promise.all([
    gapService.settings().catch(() => null),
    gapService.spend(user.id).catch(() => ({ unitsUsed: 0, runsThisCycle: 0 })),
    gapService.recentRuns(user.id).catch(() => []),
  ]);

  const allowance = settings?.runsPerAccount ?? 0;
  const left = Math.max(0, allowance - spend.runsThisCycle);
  const available = Boolean(settings?.enabled);

  return (
    <>
      <PageTitle
        title="Link gap finder"
        description="Find the sites linking to your competitors but not to you — and see which of them you can buy from us today."
      />

      {!available ? (
        <Card className="mb-6">
          <CardContent className="py-5 text-[14px] text-ink">
            The gap finder is not available at the moment. It will be back shortly.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="py-5">
              <GapForm
                maxCompetitors={settings?.maxCompetitors ?? 3}
                reportsLeft={left}
                allowance={allowance}
              />
            </CardContent>
          </Card>

          <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-muted">
            A report looks at the strongest {(settings?.rowsPerTarget ?? 2500).toLocaleString('en-GB')}{' '}
            referring domains for each site, which is where the gaps worth closing are. It takes
            under a minute.
          </p>
        </>
      )}

      <h2 className="mb-3 text-[15px] font-semibold text-ink">Your reports</h2>

      {recent.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No reports yet"
          description="Run your first one above. You will get a list of sites linking to your competitors, with the ones we sell marked."
        />
      ) : (
        <ul className="space-y-3">
          {recent.map((run) => (
            <li key={run.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/link-gap/${run.id}`}
                      className="text-[14px] font-semibold text-ink hover:underline"
                    >
                      {run.targetDomain}
                    </Link>
                    <p className="mt-0.5 text-[12px] text-muted">
                      vs {run.competitorDomains.join(', ')} &middot; {formatDate(run.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {run.status === 'completed' ? (
                      <>
                        <Badge tone="neutral">
                          {run.gapsFound.toLocaleString('en-GB')} gaps
                        </Badge>
                        <Badge tone="accent">{run.sellableFound} available here</Badge>
                      </>
                    ) : (
                      <Badge tone="outline">{run.status}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
