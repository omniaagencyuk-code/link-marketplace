import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Faq } from '@/components/shared/faq';
import { FinalCta } from '@/components/home/final-cta';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/table';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';
import { cn } from '@/lib/utils/cn';

const SLUG = 'pricing';

interface PlanEntry extends Record<string, unknown> {
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string;
  excluded: string;
  ctaLabel: string;
  ctaHref: string;
  featured: string;
}
interface BandEntry extends Record<string, unknown> {
  band: string;
  guestPost: string;
  nicheEdit: string;
  note: string;
}
interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}

/** Multi-line fields are edited as one box per plan, one item per line. */
function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function PricingPage() {
  const content = await pageContentService.content(SLUG);

  const plans = content.list<PlanEntry>('plans', 'items');
  const bands = content.list<BandEntry>('bands', 'items');
  const faqs = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  return (
    <>
      <PageHero
        eyebrow={content.text('hero', 'eyebrow')}
        title={content.text('hero', 'title')}
        description={content.text('hero', 'intro')}
      />

      {plans.length ? (
        <section className="border-b border-line bg-white py-14 lg:py-18">
          <Container size="wide">
            <div className="grid gap-5 lg:grid-cols-3">
              {plans.map((plan, index) => {
                const featured = plan.featured.trim().toLowerCase() === 'yes';
                return (
                  <div
                    key={plan.name || index}
                    className={cn(
                      'flex flex-col rounded-xl border bg-white p-6 shadow-[var(--shadow-card)]',
                      featured ? 'border-navy-900 ring-1 ring-navy-900/10' : 'border-line',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-[15px] font-semibold text-ink">{plan.name}</h2>
                      {featured ? <Badge tone="coral">Most popular</Badge> : null}
                    </div>
                    <p className="tabular mt-4 text-3xl font-semibold text-ink">{plan.price}</p>
                    <p className="mt-1 text-[13px] text-muted">{plan.cadence}</p>
                    <p className="mt-4 text-[14px] leading-relaxed text-muted">{plan.description}</p>

                    <ul className="mt-6 flex-1 space-y-2.5">
                      {lines(plan.features).map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-[13px] text-ink-soft">
                          <Check
                            className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                            aria-hidden="true"
                          />
                          {feature}
                        </li>
                      ))}
                      {lines(plan.excluded).map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-[13px] text-muted-soft">
                          <Minus className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {plan.ctaLabel ? (
                      <Button
                        asChild
                        className="mt-6 w-full"
                        variant={featured ? 'primary' : 'outline'}
                        size="lg"
                      >
                        <Link href={plan.ctaHref || '/signup'}>{plan.ctaLabel}</Link>
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      {bands.length ? (
        <section className="border-b border-line bg-surface py-14 lg:py-18">
          <Container size="wide">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('bands', 'heading')}
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-muted">{content.text('bands', 'intro')}</p>

            <TableWrap className="mt-6">
              <Table>
                <caption className="sr-only">
                  {content.text('bands', 'heading')}
                </caption>
                <thead>
                  <tr>
                    <Th>Authority band</Th>
                    <Th className="text-right">Guest post</Th>
                    <Th className="text-right">Niche edit</Th>
                    <Th className="hidden sm:table-cell">Typical publishers</Th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band, index) => (
                    <Tr key={band.band || index}>
                      <Td className="font-medium text-ink">{band.band}</Td>
                      <Td className="tabular text-right text-ink-soft">{band.guestPost}</Td>
                      <Td className="tabular text-right text-ink-soft">{band.nicheEdit}</Td>
                      <Td className="hidden text-muted sm:table-cell">{band.note}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>

            <p className="mt-4 text-[12px] text-muted">{content.text('bands', 'footnote')}</p>
          </Container>
        </section>
      ) : null}

      {faqs.length ? (
        <section className="bg-white py-14 lg:py-18">
          <Container size="narrow">
            <Faq items={faqs.map((entry) => ({ question: entry.question, answer: entry.answer }))} />
          </Container>
        </section>
      ) : null}

      <FinalCta />
    </>
  );
}
