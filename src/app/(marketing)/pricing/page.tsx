import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Faq } from '@/components/shared/faq';
import { CtaSection } from '@/components/home/cta-section';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { brand } from '@/lib/config/brand';
import { formatPrice } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Transparent per-placement pricing with no subscription required. See typical guest post and niche edit prices by domain rating, plus optional agency plans.',
  alternates: { canonical: '/pricing' },
};

const plans = [
  {
    name: 'Starter',
    price: 'Free',
    cadence: 'Pay per placement',
    description: 'For individual SEOs and small sites placing a handful of links each month.',
    features: [
      'Full marketplace access',
      'Saved website shortlists',
      'Standard marketplace pricing',
      'Email support',
    ],
    excluded: ['Volume discounts', 'Dedicated account manager', 'API access'],
    cta: 'Create an account',
    href: '/signup',
    featured: false,
  },
  {
    name: 'Growth',
    price: formatPrice(9900),
    cadence: 'per month',
    description: 'For agencies running multiple client campaigns with monthly link budgets.',
    features: [
      'Everything in Starter',
      '7% discount on every placement',
      'Bulk ordering and CSV export',
      'Client workspaces and reporting',
      'Priority support within 4 hours',
    ],
    excluded: ['Dedicated account manager'],
    cta: 'Start with Growth',
    href: '/signup?plan=growth',
    featured: true,
  },
  {
    name: 'Agency',
    price: 'Custom',
    cadence: 'Annual contract',
    description: 'For teams spending five figures a month across many domains and markets.',
    features: [
      'Everything in Growth',
      'Negotiated publisher rates',
      'Dedicated account manager',
      'API access and white labelling',
      'Invoiced billing with 30 day terms',
    ],
    excluded: [],
    cta: 'Talk to sales',
    href: `mailto:${brand.salesEmail}`,
    featured: false,
  },
];

const priceBands = [
  { band: 'DR 20-39', guestPost: 12000, nicheEdit: 9000, note: 'Niche blogs and regional titles' },
  { band: 'DR 40-54', guestPost: 18000, nicheEdit: 13500, note: 'Established category sites' },
  { band: 'DR 55-64', guestPost: 26000, nicheEdit: 19500, note: 'Well known publications' },
  { band: 'DR 65-74', guestPost: 42000, nicheEdit: 31000, note: 'National and high authority media' },
  { band: 'DR 75+', guestPost: 89000, nicheEdit: 65000, note: 'Tier one press, digital PR only on some' },
];

const faqs = [
  {
    question: 'Do I need a subscription to buy links?',
    answer:
      'No. The marketplace is open on the free Starter plan and you only pay for the placements you order. Paid plans exist for teams that want discounts, bulk tools and reporting.',
  },
  {
    question: 'Why do prices vary so much between sites?',
    answer:
      'Price follows demand, authority and editorial effort. A DR 70 national title with a real newsroom costs more than a DR 35 niche blog because the audience, scrutiny and link value are different.',
  },
  {
    question: 'Are there any hidden fees?',
    answer:
      'No. The price on the listing is the price you pay, including writing where the publisher supplies content. VAT is added at checkout for UK customers.',
  },
  {
    question: 'What happens if a placement is not delivered?',
    answer:
      'If a publisher cannot deliver within the stated turnaround you get a full refund or a free replacement on a comparable site. Cancelled orders are refunded within five working days.',
  },
];

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Pay for placements, not for access"
        description="Every website in the marketplace has a fixed price shown up front. Plans are optional and exist to give high volume teams discounts and tooling."
      />

      <section className="border-b border-line bg-white py-14 lg:py-18">
        <Container size="wide">
          <div className="grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'flex flex-col rounded-xl border bg-white p-6 shadow-[var(--shadow-card)]',
                  plan.featured ? 'border-navy-900 ring-1 ring-navy-900/10' : 'border-line',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-ink">{plan.name}</h2>
                  {plan.featured ? <Badge tone="coral">Most popular</Badge> : null}
                </div>
                <p className="tabular mt-4 text-3xl font-semibold text-ink">{plan.price}</p>
                <p className="mt-1 text-[13px] text-muted">{plan.cadence}</p>
                <p className="mt-4 text-[14px] leading-relaxed text-muted">{plan.description}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-[13px] text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                  {plan.excluded.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-[13px] text-muted-soft">
                      <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className="mt-6 w-full"
                  variant={plan.featured ? 'primary' : 'outline'}
                  size="lg"
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface py-14 lg:py-18">
        <Container size="wide">
          <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Typical placement prices
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">
            Indicative ranges across the marketplace. Individual listings always show their own
            fixed price, and digital PR is quoted per campaign.
          </p>

          <TableWrap className="mt-6">
            <Table>
              <caption className="sr-only">Typical placement prices by domain rating band</caption>
              <thead>
                <tr>
                  <Th>Authority band</Th>
                  <Th className="text-right">Guest post</Th>
                  <Th className="text-right">Niche edit</Th>
                  <Th className="hidden sm:table-cell">Typical publishers</Th>
                </tr>
              </thead>
              <tbody>
                {priceBands.map((band) => (
                  <Tr key={band.band}>
                    <Td className="font-medium text-ink">{band.band}</Td>
                    <Td className="tabular text-right text-ink-soft">
                      from {formatPrice(band.guestPost)}
                    </Td>
                    <Td className="tabular text-right text-ink-soft">
                      from {formatPrice(band.nicheEdit)}
                    </Td>
                    <Td className="hidden text-muted sm:table-cell">{band.note}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>

          <p className="mt-4 text-[12px] text-muted">
            Prices are shown in {brand.currency} and exclude VAT. Growth and Agency plans apply
            their discount automatically at checkout.
          </p>
        </Container>
      </section>

      <section className="bg-white py-14 lg:py-18">
        <Container size="narrow">
          <Faq items={faqs} />
        </Container>
      </section>

      <CtaSection />
    </>
  );
}
