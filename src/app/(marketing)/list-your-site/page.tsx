import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/shared/faq';
import { SiteOfferForm } from '@/components/publishers/site-offer-form';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'list-your-site';

/**
 * /list-your-site
 *
 * The only page on the public site addressed to a publisher rather than a
 * buyer, which is why it ends where it does.
 *
 * Every other marketing page closes with `FinalCta` - "browse the
 * marketplace", "create an account". That band is the buyer's half of the
 * business, and putting it under a page asking somebody to sell us a
 * placement would end their visit by inviting them to buy one. This page
 * closes on its own FAQ instead.
 *
 * The form is the one fixed thing on it. Everything around it is edited in
 * /admin/pages; the fields are not, because what they collect goes into
 * columns.
 */

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}

interface StepEntry extends Record<string, unknown> {
  heading: string;
  description: string;
}

/** Multi-line fields are edited as one box, one item per line. */
function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export default async function ListYourSitePage() {
  const content = await pageContentService.content(SLUG);

  const heroBenefits = lines(content.text('hero', 'benefits'));
  const points = lines(content.text('criteria', 'points'));
  const steps = content
    .list<StepEntry>('steps', 'items')
    .filter((entry) => entry.heading);
  const faqs = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        {/* One wash of brand colour behind the text, as on /pricing. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(52rem 28rem at 12% -10%, rgba(16,185,129,0.10) 0%, transparent 60%)',
          }}
        />

        <Container size="wide" className="relative py-16 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              {content.text('hero', 'eyebrow')}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl lg:text-[2.9rem] lg:leading-[1.08]">
              {content.text('hero', 'title')}
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-muted lg:text-[17px]">
              {content.text('hero', 'intro')}
            </p>

            <div className="mt-8">
              {/*
                A plain anchor. The stylesheet already sets smooth scrolling
                and already turns it off under `prefers-reduced-motion`, so a
                script here would be worse at the job and would have to be
                told about that preference as well.
              */}
              <Button asChild variant="accent" size="lg">
                <a href="#offer">{content.text('hero', 'primaryCta')}</a>
              </Button>
            </div>

            {heroBenefits.length ? (
              <div className="mt-8 border-t border-line pt-6">
                <ul className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
                  {heroBenefits.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[14px] text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      {/* -------------------------------------------- what happens to it */}
      <section className="border-b border-line bg-white py-16 lg:py-20">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:items-start lg:gap-16">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {content.text('criteria', 'heading')}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">
                {content.text('criteria', 'intro')}
              </p>
            </div>

            {points.length ? (
              <ul className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-6">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[14px] leading-relaxed text-ink-soft">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------- how it works */}
      {steps.length ? (
        <section className="border-b border-line bg-surface py-16 lg:py-20">
          <Container size="wide">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('steps', 'heading')}
            </h2>

            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.heading}
                  className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-700 text-[13px] font-semibold text-white"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-[16px] font-semibold text-ink">{step.heading}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.description}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>
      ) : null}

      {/* ----------------------------------------------------- the form */}
      {/*
        `scroll-mt` because the header is sticky: without it the heading
        lands underneath the header and the section looks like it begins at
        the form.
      */}
      <section id="offer" className="scroll-mt-24 border-b border-line bg-white py-16 lg:py-20">
        <Container size="narrow">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('offer', 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {content.text('offer', 'intro')}
            </p>
          </div>

          <div className="mt-8">
            <SiteOfferForm reassurance={content.text('offer', 'reassurance')} />
          </div>
        </Container>
      </section>

      {/* -------------------------------------------------------- the FAQ */}
      {faqs.length ? (
        <section className="bg-surface py-16 lg:py-20">
          <Container size="narrow">
            <Faq items={faqs.map((entry) => ({ question: entry.question, answer: entry.answer }))} />
          </Container>
        </section>
      ) : null}
    </>
  );
}
