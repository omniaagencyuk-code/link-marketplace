import type { Metadata } from 'next';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/shared/faq';
import { FinalCta } from '@/components/home/final-cta';
import { BuyingOptions, type BuyingOption } from '@/components/pricing/buying-options';
import { EnquiryForm } from '@/components/pricing/enquiry-form';
import { metadataForPage } from '@/lib/cms/metadata';
import { pageContentService } from '@/lib/services/page-content-service';

const SLUG = 'pricing';

/**
 * /pricing
 *
 * The page stopped selling plans. Press Parrot is a marketplace: every
 * listing shows its own price, anybody can buy one placement, and there is no
 * tier to be on. What this page does now is say that plainly and then make
 * the other half easy - that agencies, bulk buyers and anybody ordering
 * regularly are welcome to ask about rates.
 *
 * One message, said twice: buy at the listed price without talking to
 * anybody, or talk to us if you are buying a lot. Everything on the page is
 * one of those two things.
 *
 * ## What is not on it, and why
 *
 * No percentages, no minimum spends, no named rates. `profiles.plan` still
 * decides what a buyer is charged at checkout, through `tierFor` and
 * `placementPrice`, and this page cannot promise a figure that pricing code
 * does not apply - a price we never set is one we have to honour or retract.
 * Every card here says a conversation is possible, which is true, and none
 * of them says what it will conclude.
 *
 * The authority-band price table went with the plans. It quoted indicative
 * ranges that nothing kept in step with the marketplace, so a visitor who
 * found a real listing far off the range had been told a number we never
 * charged.
 *
 * ## The anchor
 *
 * Three buttons scroll to `#enquiry` and they are all plain anchors. The
 * stylesheet already sets `scroll-behavior: smooth` and already turns it off
 * under `prefers-reduced-motion`, so a script here would be worse at the job
 * and would also have to be told about that preference.
 */

export async function generateMetadata(): Promise<Metadata> {
  return metadataForPage(SLUG);
}

interface FaqEntry extends Record<string, unknown> {
  question: string;
  answer: string;
}

/** Multi-line fields are edited as one box, one item per line. */
function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** The hero's three points: a row on a wide screen, a column on a phone. */
function Ticks({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-[14px] text-ink-soft">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-700" aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function PricingPage() {
  const content = await pageContentService.content(SLUG);

  const options = content.list<BuyingOption>('options', 'items');
  const faqs = content
    .list<FaqEntry>('faqs', 'items')
    .filter((entry) => entry.question && entry.answer);

  const heroBenefits = lines(content.text('hero', 'benefits'));
  const agencyBenefits = lines(content.text('agency', 'benefits'));
  const agencyBody = content.text('agency', 'body').split('\n\n').filter(Boolean);

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden border-b border-line bg-white">
        {/*
          One wash of brand colour, behind the text, and nothing else.

          The brief asked for a subtle background rather than the floating
          shapes and stacked gradients that make a page look generated. This
          is a single soft radial in the accent colour, at low opacity, with
          the page's own white underneath it.
        */}
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

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <a href="#enquiry">{content.text('hero', 'primaryCta')}</a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/marketplace">{content.text('hero', 'secondaryCta')}</Link>
              </Button>
            </div>

            <div className="mt-8 border-t border-line pt-6">
              <Ticks items={heroBenefits} />
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------- ways to buy */}
      <section className="border-b border-line bg-white py-16 lg:py-20">
        <Container size="wide">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('options', 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {content.text('options', 'intro')}
            </p>
          </div>

          <BuyingOptions items={options} />
        </Container>
      </section>

      {/* ------------------------------------------------------- agencies */}
      <section className="border-b border-line bg-surface py-16 lg:py-20">
        <Container size="wide">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start lg:gap-16">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
                {content.text('agency', 'label')}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {content.text('agency', 'heading')}
              </h2>
              {agencyBody.map((paragraph) => (
                <p key={paragraph} className="mt-4 text-[15px] leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}

              <div className="mt-7">
                <Button asChild variant="primary" size="lg">
                  <a href="#enquiry">{content.text('agency', 'ctaLabel')}</a>
                </Button>
              </div>
            </div>

            {agencyBenefits.length ? (
              <ul className="space-y-3 rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]">
                {agencyBenefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2.5 text-[14px] text-ink-soft">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-700"
                      aria-hidden="true"
                    />
                    {benefit}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Container>
      </section>

      {/* ---------------------------------------------------- the enquiry */}
      {/*
        `scroll-mt` because the header is sticky: without it the heading
        lands underneath the header and the section looks like it begins at
        the form.
      */}
      <section id="enquiry" className="scroll-mt-24 border-b border-line bg-white py-16 lg:py-20">
        <Container size="narrow">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {content.text('enquiry', 'heading')}
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {content.text('enquiry', 'intro')}
            </p>
          </div>

          <div className="mt-8">
            <EnquiryForm reassurance={content.text('enquiry', 'reassurance')} />
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

      {/*
        The site's closing band, unchanged.

        Kept rather than dropped: it is on /how-it-works and the service pages
        too, and a /pricing that ended differently from every other marketing
        page would read as a page from somewhere else. Its buttons are the
        "just buy one" half of this page's message, which is the half the
        form does not serve.
      */}
      <FinalCta />
    </>
  );
}
