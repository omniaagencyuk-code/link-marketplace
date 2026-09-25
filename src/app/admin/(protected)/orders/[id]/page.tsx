import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Mail, Lock } from 'lucide-react';
import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminOrderStatus } from '@/components/admin/admin-order-status';
import { AdminItemDelivery } from '@/components/admin/admin-item-delivery';
import { AdminOrderEmails } from '@/components/admin/admin-order-emails';
import { orderService, websiteService } from '@/lib/services';
import { emailService } from '@/lib/services/email-service';
import { formatDateTime, formatPrice } from '@/lib/utils/format';
import { linkTypeLabels, orderStatusLabels } from '@/lib/utils/labels';
import { acceptedNicheLabel } from '@/lib/config/accepted-niches';
import { nicheStances } from '@/lib/services/niche-policy';
import type { Website } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * One order, as the person fulfilling it needs to see it.
 *
 * The list answers "what is outstanding"; this answers "what do I do about
 * it", which means the publisher's address, what we agreed to pay them, and
 * what the customer asked for - on one page, so nobody has to open three.
 *
 * Everything internal on this page is internal everywhere else: the cost
 * price lives in a table with no customer policy, the contact lives in
 * another, and both are stripped from any payload a customer could reach.
 * This is an admin route behind `requireAdminSession()` in the layout.
 */
export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await orderService.getById(id);
  if (!order) notFound();

  // The websites the order touches, read through the admin path so the cost
  // and the contact come with them.
  const websites = await Promise.all(
    Array.from(new Set(order.items.map((item) => item.websiteId))).map((websiteId) =>
      websiteService.getById(websiteId),
    ),
  );
  const byId = new Map(
    websites.filter(Boolean).map((website) => [(website as Website).id, website as Website]),
  );

  // What we have told the customer about this order. A failure to load it is
  // not a reason to fail the page.
  const emails = await emailService.forOrder(order.id).catch(() => []);

  /*
    Whether each site was ever confirmed for the topic it was bought for.
    Only sites sourced from an email have an answer here: one added by hand
    or by CSV has no record either way, and warning about those would put a
    caution on every legacy order and teach everyone to ignore it.
  */
  const stances = await nicheStances(Array.from(byId.keys()));

  const costTotal = order.items.reduce((total, item) => {
    const service = byId
      .get(item.websiteId)
      ?.services.find((entry) => entry.type === item.serviceType);
    return total + (service?.costPriceMinor ?? 0);
  }, 0);

  const costsKnown = order.items.every((item) =>
    typeof byId
      .get(item.websiteId)
      ?.services.find((entry) => entry.type === item.serviceType)?.costPriceMinor === 'number',
  );

  return (
    <>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        All orders
      </Link>

      <PageTitle
        title={order.reference}
        description={`Placed ${formatDateTime(order.placedAt)} by ${order.customerName}`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="min-w-0 space-y-5">
          {order.items.map((item) => {
            const website = byId.get(item.websiteId);
            const service = website?.services.find((entry) => entry.type === item.serviceType);
            const cost = service?.costPriceMinor;
            const profit = typeof cost === 'number' ? item.priceMinor - cost : null;
            // A premium is visible from the order alone, at the rates of the
            // day, rather than by looking up what the site charges now.
            const premium =
              typeof item.listPriceMinor === 'number' && item.listPriceMinor !== item.priceMinor
                ? item.listPriceMinor
                : null;
            const contact = website?.contact;
            // 'unknown' means we never asked and sold it anyway; 'no' means
            // the publisher told us they do not take it, which should not
            // have been sellable and is worth knowing before writing to them.
            const stance = item.topic ? stances.get(`${item.websiteId}:${item.topic}`) : undefined;

            return (
              <Card key={item.id}>
                <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle>{item.websiteDomain}</CardTitle>
                    <p className="mt-1 text-[13px] text-muted">
                      {linkTypeLabels[item.serviceType]}
                      {item.topic ? ` · ${acceptedNicheLabel(item.topic)}` : ''}
                    </p>
                  </div>
                  <Badge tone={item.status === 'live' ? 'accent' : 'neutral'}>
                    {orderStatusLabels[item.status]}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* ------------------------------------- the publisher */}
                  <div className="rounded-[var(--radius-card)] border border-line bg-surface/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                        <Lock className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                        Publisher contact
                      </h3>
                      <span className="text-[11px] text-muted">Internal only</span>
                    </div>

                    {stance === 'unknown' || stance === 'no' ? (
                      <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                        {stance === 'no' ? (
                          <span>
                            This publisher told us they do <strong className="font-medium">not</strong>{' '}
                            take {acceptedNicheLabel(item.topic ?? '')}. Confirm before placing, and
                            check the listing is not still selling it.
                          </span>
                        ) : (
                          <span>
                            We never confirmed that this site takes{' '}
                            {acceptedNicheLabel(item.topic ?? '')} - their reply did not mention it.
                            Worth asking in the same email.
                          </span>
                        )}
                      </p>
                    ) : null}

                    {contact?.email ? (
                      <div className="mt-3 space-y-1.5">
                        <a
                          href={`mailto:${contact.email}?subject=${encodeURIComponent(
                            `${item.websiteDomain} - placement ${order.reference}`,
                          )}`}
                          className="inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-700 hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          {contact.email}
                        </a>
                        {contact.name ? (
                          <p className="text-[13px] text-ink-soft">{contact.name}</p>
                        ) : null}
                        {contact.notes ? (
                          <p className="text-[13px] leading-relaxed text-muted">{contact.notes}</p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-[13px] text-muted">
                        No contact recorded.{' '}
                        <Link
                          href={`/admin/websites/${item.websiteId}`}
                          className="text-accent-700 hover:underline"
                        >
                          Add one on the website
                        </Link>
                        .
                      </p>
                    )}
                  </div>

                  {/* ------------------------------------------ the money */}
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Figure label="Customer pays" value={formatPrice(item.priceMinor)} strong />
                    <Figure
                      label="We pay"
                      value={typeof cost === 'number' ? formatPrice(cost) : 'Not recorded'}
                      muted={typeof cost !== 'number'}
                    />
                    <Figure
                      label="Profit"
                      value={profit === null ? '—' : formatPrice(profit)}
                      muted={profit === null}
                      strong={profit !== null}
                    />
                  </dl>

                  {premium !== null ? (
                    <p className="-mt-2 text-[12px] text-muted">
                      {acceptedNicheLabel(item.topic ?? '')} rate. The standard rate on this
                      placement was {formatPrice(premium)} when the order was placed.
                    </p>
                  ) : null}

                  {/* --------------------------------- what was ordered */}
                  <dl className="space-y-2 border-t border-line pt-4">
                    <Detail label="Target URL" value={item.targetUrl} link />
                    <Detail label="Anchor text" value={item.anchorText} />
                    {item.preferredLandingPage ? (
                      <Detail label="Landing page" value={item.preferredLandingPage} link />
                    ) : null}
                    {item.articleFileName ? (
                      <Detail label="Article supplied" value={item.articleFileName} />
                    ) : null}
                    {item.notes ? <Detail label="Customer notes" value={item.notes} /> : null}
                  </dl>

                  {/* The one thing this page could not do: hand it back. */}
                  <AdminItemDelivery item={item} orderId={order.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* ------------------------------------------------------ sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AdminOrderStatus orderId={order.id} status={order.status} />

              <dl className="space-y-2 border-t border-line pt-4 text-[13px]">
                <Row label="Customer" value={order.customerName} />
                <Row label="Email" value={order.customerEmail} mailto />
                <Row label="Placed" value={formatDateTime(order.placedAt)} />
                {order.expectedLiveAt ? (
                  <Row label="Expected live" value={formatDateTime(order.expectedLiveAt)} />
                ) : null}
                <Row label="Placements" value={String(order.items.length)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Margin</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-[13px]">
                <Row label="Net" value={formatPrice(order.totalMinor)} />
                {/*
                  VAT is shown but never counted into profit: it is collected
                  on HMRC's behalf and passed on. Treating it as revenue would
                  overstate the margin on every UK order by a fifth.
                */}
                {order.taxMinor !== undefined ? (
                  <Row label="VAT" value={formatPrice(order.taxMinor)} />
                ) : null}
                {order.chargedMinor !== undefined ? (
                  <Row label="Customer paid" value={formatPrice(order.chargedMinor)} />
                ) : null}
                <Row
                  label="Cost"
                  value={costsKnown ? formatPrice(costTotal) : `${formatPrice(costTotal)} so far`}
                />
                <Row
                  label="Profit"
                  value={formatPrice(order.totalMinor - costTotal)}
                  strong
                />
              </dl>
              {/*
                Two identical-looking things, and only the country tells them
                apart. A UK order with no VAT is not a quirk of the customer:
                it means Stripe has no UK registration, and a fifth of the
                revenue on every sale is owed to HMRC out of what was taken.
              */}
              {order.taxMinor === 0 && order.billingCountry === 'GB' ? (
                <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-negative/30 bg-negative/5 px-2.5 py-2 text-[12px] leading-relaxed text-negative">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    A UK customer paid no VAT. That is almost certainly a missing UK registration
                    in Stripe Tax - the VAT is still owed, out of what was charged. Check Stripe
                    before taking more orders.
                  </span>
                </p>
              ) : order.taxMinor === 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed text-muted">
                  No VAT{order.billingCountry ? ` (billed to ${order.billingCountry})` : ''} - an
                  overseas customer, or a business that gave a valid VAT number.
                </p>
              ) : null}
              {!costsKnown ? (
                // Said plainly rather than shown as a confident number: a
                // missing cost reads as zero in arithmetic, and a profit
                // figure that assumes a placement was free is worse than no
                // figure at all.
                <p className="mt-3 text-[12px] leading-relaxed text-muted">
                  Some placements have no cost recorded, so this profit is higher than the real
                  one.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <AdminOrderEmails emails={emails} />
        </aside>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd
        className={
          muted
            ? 'tabular mt-1 text-[14px] text-muted'
            : strong
              ? 'tabular mt-1 text-[16px] font-semibold text-ink'
              : 'tabular mt-1 text-[14px] text-ink-soft'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Detail({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <dt className="w-32 shrink-0 text-[12px] text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-[13px] break-words text-ink-soft">
        {link && /^https?:\/\//i.test(value) ? (
          <a href={value} rel="noreferrer noopener" className="text-accent-700 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  mailto,
  strong,
}: {
  label: string;
  value: string;
  mailto?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? 'tabular font-semibold text-ink' : 'tabular text-ink-soft'}>
        {mailto ? (
          <a href={`mailto:${value}`} className="text-accent-700 hover:underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
