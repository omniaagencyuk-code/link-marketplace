import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, FileSearch, Link2, Newspaper } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JourneySteps } from '@/components/home/how-it-works-section';
import { Faq } from '@/components/shared/faq';
import { FinalCta } from '@/components/home/final-cta';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'how-it-works';

/** Icons are fixed in code - editors change copy, not composition. */
const productIcons = [Newspaper, Link2, FileSearch];

interface StepEntry extends Record<string, unknown> {
  number: string;
  title: string;
  description: string;
  detail: string;
}
interface ProductEntry extends Record<string, unknown> {
  title: string;
  body: string;
  best: string;
  href: string;
  linkLabel: string;
}
interface CriterionEntry extends Record<string, unknown> {
  text: string;
}
interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

export default async function HowItWorksPage() {
  const content = await pageContentService.content(SLUG);

  const steps = content.list<StepEntry>('journey', 'steps');
  const products = content.list<ProductEntry>('products', 'items');
  const criteria = content.list<CriterionEntry>('vetting', 'items');
  const faqs = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  const primaryCta = content.link('hero', 'primaryCta');
  const secondaryCta = content.link('hero', 'secondaryCta');

  return (
    <>
      <PageHero
        eyebrow={content.text('hero', 'eyebrow')}
        title={content.text('hero', 'title')}
        description={content.text('hero', 'intro')}
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" variant="primary">
            <Link href={primaryCta.href}>{primaryCta.label}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
          </Button>
        </div>
      </PageHero>

      <JourneySteps
        heading={content.text('journey', 'heading')}
        intro={content.text('journey', 'intro')}
        steps={steps}
      />

      {products.length ? (
        <section className="border-b border-line bg-white py-14 lg:py-18">
          <Container size="wide">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('products', 'heading')}
            </h2>
            <p className="mt-2 max-w-2xl text-[15px] text-muted">
              {content.text('products', 'intro')}
            </p>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {products.map((product, index) => {
                const Icon = productIcons[index % productIcons.length];
                return (
                  <Card key={product.title || index}>
                    <CardHeader className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                        <Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <CardTitle className="text-[15px]">{product.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-[14px] leading-relaxed text-ink-soft">{product.body}</p>
                      <p className="mt-3 text-[13px] font-medium text-accent-700">{product.best}</p>
                      {product.href && product.linkLabel ? (
                        <Button asChild variant="link" size="sm" className="mt-4">
                          <Link href={product.href}>{product.linkLabel}</Link>
                        </Button>
                      ) : null}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </Container>
        </section>
      ) : null}

      {criteria.length ? (
        <section className="border-b border-line bg-surface py-14 lg:py-18">
          <Container size="wide">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {content.text('vetting', 'heading')}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  {content.text('vetting', 'intro')}
                </p>
              </div>
              <ul className="space-y-3">
                {criteria.map((criterion, index) => (
                  <li
                    key={criterion.text || index}
                    className="flex gap-3 rounded-lg border border-line bg-white p-4 text-[14px] leading-relaxed text-ink-soft shadow-[var(--shadow-card)]"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                      aria-hidden="true"
                    />
                    {criterion.text}
                  </li>
                ))}
              </ul>
            </div>
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
