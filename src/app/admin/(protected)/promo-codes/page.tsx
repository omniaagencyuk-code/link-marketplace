import { PageTitle } from '@/components/dashboard/page-title';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { PromoCodeForm, PromoRowActions } from '@/components/admin/promo-code-form';
import { promoService } from '@/lib/services/promo-service';
import { promoSummary } from '@/lib/promos/rules';
import { isStripeEnabled } from '@/lib/stripe/config';
import { formatDate, formatPrice } from '@/lib/utils/format';

/**
 * Promo codes.
 *
 * The list leads with what each code has actually given away, because that is
 * the number nobody has when they are asked whether a campaign was worth
 * running. It is counted from paid orders rather than from a tally on the row:
 * a stored counter drifts the first time an order is refunded, and the usage
 * limit is what stands between a leaked code and an unbounded discount.
 */

export const dynamic = 'force-dynamic';

export default async function PromoCodesPage() {
  const [codes, stripeReady] = await Promise.all([
    promoService.list().catch(() => []),
    Promise.resolve(isStripeEnabled()),
  ]);

  const live = codes.filter((entry) => entry.code.active).length;
  const givenAway = codes.reduce((total, entry) => total + entry.discountedMinor, 0);

  return (
    <>
      <PageTitle
        title="Promo codes"
        description="Codes buyers type at checkout. Stripe does the arithmetic; the rules live here."
      />

      {!stripeReady ? (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          Stripe is not configured on this deployment, so a new code is saved switched off: each
          one needs a Stripe coupon behind it to discount anything. Add the keys and create it
          again.
        </p>
      ) : null}

      <Card className="mb-6">
        <CardContent className="grid gap-4 py-4 sm:grid-cols-3">
          <Figure label="Codes" value={String(codes.length)} />
          <Figure label="Switched on" value={String(live)} />
          <Figure label="Discount given" value={formatPrice(givenAway)} />
        </CardContent>
      </Card>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">New code</h2>
      <PromoCodeForm />

      <h2 className="mt-8 mb-3 text-[15px] font-semibold text-ink">
        All codes
        <span className="ml-2 text-[13px] font-normal text-muted">{codes.length}</span>
      </h2>

      {codes.length === 0 ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-[13px] text-muted">
              No codes yet. Anything created above appears here, and a buyer can type it at
              checkout straight away.
            </p>
          </CardContent>
        </Card>
      ) : (
        <TableWrap>
          <Table>
            <caption className="sr-only">Promo codes</caption>
            <thead>
              <Tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Rules</Th>
                <Th>Window</Th>
                <Th className="text-right">Used</Th>
                <Th className="text-right">Given away</Th>
                <Th>State</Th>
                <Th />
              </Tr>
            </thead>
            <tbody>
              {codes.map(({ code, redemptions, discountedMinor }) => (
                <Tr key={code.id}>
                  <Td>
                    <span className="font-mono text-[13px] font-medium tracking-wide text-ink">
                      {code.code}
                    </span>
                    {code.description ? (
                      <span className="block max-w-[18rem] text-[11px] text-muted">
                        {code.description}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-[13px] font-medium text-ink">{promoSummary(code)}</Td>
                  <Td className="text-[12px] text-muted">
                    <Rules
                      minOrderMinor={code.minOrderMinor}
                      maxPerCustomer={code.maxPerCustomer}
                      maxRedemptions={code.maxRedemptions}
                      firstOrderOnly={code.firstOrderOnly}
                    />
                  </Td>
                  <Td className="text-[12px] text-muted">
                    {code.startsAt ? `from ${formatDate(code.startsAt)}` : 'from now'}
                    <br />
                    {code.expiresAt ? `until ${formatDate(code.expiresAt)}` : 'no end date'}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink">
                    {redemptions}
                    {code.maxRedemptions != null ? (
                      <span className="text-muted"> / {code.maxRedemptions}</span>
                    ) : null}
                  </Td>
                  <Td className="tabular text-right text-[13px] text-ink">
                    {discountedMinor > 0 ? formatPrice(discountedMinor) : '—'}
                  </Td>
                  <Td>
                    {/* A code with no Stripe coupon is called out specifically.
                        It reads as off, but the reason matters: creating it
                        again is the fix, not switching it on. */}
                    {!code.stripeCouponId ? (
                      <Badge tone="warning">No Stripe coupon</Badge>
                    ) : (
                      <Badge tone={code.active ? 'positive' : 'neutral'}>
                        {code.active ? 'On' : 'Off'}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <PromoRowActions
                      id={code.id}
                      code={code.code}
                      active={code.active}
                      used={redemptions}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}

function Rules({
  minOrderMinor,
  maxPerCustomer,
  maxRedemptions,
  firstOrderOnly,
}: {
  minOrderMinor?: number;
  maxPerCustomer?: number;
  maxRedemptions?: number;
  firstOrderOnly: boolean;
}) {
  const rules = [
    minOrderMinor ? `${formatPrice(minOrderMinor)} minimum` : null,
    maxPerCustomer === 1
      ? 'once per customer'
      : maxPerCustomer
        ? `${maxPerCustomer} per customer`
        : null,
    maxRedemptions ? `${maxRedemptions} in total` : null,
    firstOrderOnly ? 'first orders only' : null,
  ].filter(Boolean);

  // Said out loud rather than shown as an empty cell: "no restrictions" is a
  // thing somebody should notice before they post the code publicly.
  return <>{rules.length === 0 ? 'no restrictions' : rules.join(' · ')}</>;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-semibold text-ink">{value}</p>
    </div>
  );
}
