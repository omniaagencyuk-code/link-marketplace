import Link from 'next/link';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  CreditCard,
  FileText,
  Globe,
  Link2,
  Package,
  Radar,
  Search,
  Sparkles,
  Timer,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/shared/status-badge';
import { PanelEmpty, QuickActionTile, SectionHeader, StatCard } from '@/components/dashboard/home/cards';
import { SiteMark } from '@/components/dashboard/home/site-mark';
import { SavedPanel } from '@/components/dashboard/home/saved-panel';
import { SavedCountStat } from '@/components/dashboard/saved-count-stat';
import { customerDashboardService } from '@/lib/services/customer-dashboard-service';
import { websiteService } from '@/lib/services';
import { requireCustomerSession } from '@/lib/auth/customer-access';
import { formatCompactNumber, formatDate, formatPrice } from '@/lib/utils/format';
import { nicheName } from '@/lib/data/categories';
import { readingTime } from '@/lib/cms/markdown';
import type { OrderStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * The customer dashboard.
 *
 * ## Nothing here is invented
 *
 * Where the reference design shows something this application does not have,
 * the panel shows what it does:
 *
 *   * There is no wallet and no prepaid balance, so "Your account" is the
 *     plan, the orders and a route to billing rather than a balance of money
 *     that does not exist. The brief asked for exactly this and it is the one
 *     place a redesign could have quietly implied a payment system.
 *   * Saved sites live in the browser's storage, so that panel is a client
 *     island - and cannot be a signal for recommendations.
 *   * Suggestions are headed "Recommended for you" only when they came from
 *     the categories this customer has ordered in. Otherwise they are
 *     "Popular websites", which is what they are.
 *
 * ## Every figure is the customer's own
 *
 * Read through `getServerClient`, which carries their session, so row level
 * security scopes it. Nothing on this page uses the admin client.
 */
export default async function DashboardPage() {
  const user = await requireCustomerSession('/dashboard');
  const data = await customerDashboardService.read();

  // The suggestions arrive as ids; the listings behind them come from the
  // customer's own read, which is the one that strips costs and contacts.
  const recommended = data.recommendationIds.length
    ? await websiteService.getByIds(data.recommendationIds).catch(() => [])
    : [];

  const summary = data.summary;
  const firstName = (user.fullName || 'there').split(' ')[0];
  const hour = new Date().getUTCHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Welcome back';

  const activeHint = summary
    ? summary.activeOrders === 0
      ? 'Nothing in flight yet'
      : [
          summary.inProgress > 0 ? `${summary.inProgress} in progress` : null,
          summary.awaitingContent > 0 ? `${summary.awaitingContent} awaiting content` : null,
        ]
          .filter(Boolean)
          .join(', ') || `${summary.activeOrders} under way`
    : '—';

  return (
    <div className="space-y-6">
      {/*
        The wash behind the welcome is two CSS gradients rather than a
        picture: the brief asked for the shapes and asked for them not to cost
        a download on the page people open most.
      */}
      <section className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-accent-100/60 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 -bottom-28 h-56 w-56 rounded-full bg-accent-50 blur-2xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink sm:text-[30px]">
              {greeting}, {firstName} <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1.5 text-[14px] text-muted">
              Find, order and track high-quality links from trusted publishers.
            </p>
          </div>
          <Link
            href="/marketplace"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-600 px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-accent-700"
          >
            Browse websites
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active orders"
          value={summary ? String(summary.activeOrders) : '—'}
          hint={activeHint}
          icon={Timer}
          tone="accent"
          href="/dashboard/orders"
        />
        <StatCard
          label="Live links"
          value={summary ? String(summary.liveLinks) : '—'}
          hint={
            summary && summary.liveLinksThisMonth > 0
              ? `${summary.liveLinksThisMonth} this month`
              : 'Placements confirmed live'
          }
          icon={Link2}
          tone="info"
          href="/dashboard/orders"
        />
        <StatCard
          label="Total spent"
          value={summary ? formatPrice(summary.totalSpendMinor) : '—'}
          hint="Excludes cancelled orders"
          icon={Wallet}
          tone="violet"
          href="/dashboard/billing"
        />
        {/* A client island: the shortlist lives in this browser's storage. */}
        <SavedCountStat />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <SectionHeader
            title="Quick actions"
            description="Get started with your next campaign"
            icon={Sparkles}
          />
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <QuickActionTile label="Browse websites" href="/marketplace" icon={Search} tone="accent" />
              <QuickActionTile label="Order content" href="/dashboard/content/new" icon={FileText} tone="mint" />
              <QuickActionTile label="Track orders" href="/dashboard/orders" icon={Package} tone="peach" />
              <QuickActionTile label="View saved sites" href="/dashboard/saved" icon={Bookmark} tone="sky" />
              <QuickActionTile label="Link gap finder" href="/dashboard/link-gap" icon={Radar} tone="lilac" />
              {/*
                "Find opportunities" in the reference is the link gap finder
                under another name - there is no separate feature - so it goes
                to the marketplace sorted by the metric somebody looking for
                opportunities is sorting by, rather than to a page that does
                not exist.
              */}
              <QuickActionTile label="Top rated sites" href="/marketplace?sort=dr-desc" icon={Globe} tone="sand" />
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader title="Your account" icon={CreditCard} />
          <CardContent className="space-y-3">
            {/*
              No balance, because there is no wallet. Showing one would imply
              a prepaid system that does not exist, which is the single most
              expensive thing a visual redesign could invent.
            */}
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Account</dt>
                <dd className="truncate font-medium text-ink">{user.company || user.fullName}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Plan</dt>
                <dd className="font-medium text-ink capitalize">{user.plan ?? 'Starter'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Orders placed</dt>
                <dd className="tabular font-medium text-ink">{summary ? summary.ordersAll : '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-muted">Placements live</dt>
                <dd className="tabular font-medium text-ink">{summary ? summary.liveLinks : '—'}</dd>
              </div>
            </dl>
            <Link
              href="/dashboard/billing"
              className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-muted-soft hover:bg-surface-sunken hover:text-ink"
            >
              Invoices and payment
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <SectionHeader
            title="Recent orders"
            description="Your latest link building orders"
            icon={Package}
            action={{ label: 'View all orders', href: '/dashboard/orders' }}
          />
          {data.orders.length === 0 ? (
            <PanelEmpty
              icon={Package}
              title="No orders yet"
              body="Find websites in the marketplace and add them to your first campaign."
              action={{ label: 'Browse websites', href: '/marketplace' }}
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
                  >
                    <span className="tabular w-20 shrink-0 text-[12px] text-muted">
                      {order.reference}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {order.websiteDomain ?? 'No placements'}
                        {order.itemCount > 1 ? (
                          <span className="font-normal text-muted"> +{order.itemCount - 1}</span>
                        ) : null}
                      </span>
                      {order.targetUrl ? (
                        <span className="block truncate text-[12px] text-muted">
                          {order.targetUrl}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular shrink-0 text-[13px] font-semibold text-ink">
                      {formatPrice(order.totalMinor)}
                    </span>
                    <span className="shrink-0">
                      <OrderStatusBadge status={order.status as OrderStatus} />
                    </span>
                    <span className="hidden shrink-0 text-[12px] text-muted sm:block">
                      {formatDate(order.placedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader
            title="Saved websites"
            description="Publishers you have shortlisted"
            icon={Bookmark}
            action={{ label: 'View all', href: '/dashboard/saved' }}
          />
          <SavedPanel />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <SectionHeader
            // The heading is chosen by the data, not written in. It only says
            // "for you" when it was actually built from this customer's orders.
            title={data.personalised ? 'Recommended for you' : 'Popular websites'}
            description={
              data.personalised
                ? 'Publishers in the categories you have ordered in'
                : 'Highly rated publishers to start with'
            }
            icon={Globe}
            action={{ label: 'See the marketplace', href: '/marketplace' }}
          />
          <CardContent>
            {recommended.length === 0 ? (
              <PanelEmpty
                icon={Globe}
                title="Nothing to suggest yet"
                body="Once there are listings available, suggestions will appear here."
                action={{ label: 'Browse websites', href: '/marketplace' }}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {recommended.map((website) => (
                  <Link
                    key={website.id}
                    href={`/websites/${website.slug}`}
                    className="group flex flex-col rounded-xl border border-line p-3 transition-all hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-md"
                  >
                    <SiteMark domain={website.domain} />
                    <p className="mt-2.5 truncate text-[13px] font-semibold text-ink">
                      {website.domain}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {nicheName(website.niche)}
                    </p>
                    <p className="tabular mt-2 text-[11px] text-muted">
                      DR {website.metrics.domainRating} &middot;{' '}
                      {formatCompactNumber(website.metrics.organicTraffic)}
                    </p>
                    <p className="tabular mt-2 text-[15px] font-semibold text-ink">
                      {website.headlineService
                        ? formatPrice(website.headlineService.priceMinor)
                        : '—'}
                    </p>
                    <span className="mt-2.5 inline-flex items-center justify-center rounded-lg bg-accent-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors group-hover:bg-accent-700">
                      View website
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader
            title="Learn and grow"
            description="Helpful resources for better link building"
            icon={BookOpen}
            action={{ label: 'All guides', href: '/resources' }}
          />
          {/* Real posts or no section: nothing is hardcoded here. */}
          {data.posts.length === 0 ? (
            <PanelEmpty
              icon={BookOpen}
              title="No guides published yet"
              body="Articles will appear here as they are written."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.posts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/resources/${post.slug}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {post.title}
                      </span>
                      {/* Counted from the post's own words by the helper the
                          article page already uses, rather than guessed at or
                          stored. */}
                      <span className="block text-[11px] text-muted">{readingTime(post.body)}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-soft" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
