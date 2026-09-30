import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { RedactedPreview } from '@/components/marketplace/redacted-preview';
import type { PreviewRow } from '@/lib/services/marketplace-preview';
import type { BlogCtaSection, BlogFaq, BlogMarketplaceSection } from '@/lib/config/blog-sections';

/**
 * The blocks that sit around a blog post.
 *
 * Their own file because the post page was already long and because these are
 * the parts an editor now controls: keeping them together makes it obvious
 * what a post can change and what it cannot. Nothing here decides whether it
 * renders - the page does that, from the post's own settings.
 */

/**
 * The marketplace block.
 *
 * A narrower version of the one on the service pages: an article has already
 * earned the reader's attention with its argument, so this restates far less
 * and gets to the button sooner. The redacted table is the same component,
 * because the promise it makes has to be the same promise.
 */
export function PostMarketplace({
  section,
  rows,
}: {
  section: BlogMarketplaceSection;
  rows: PreviewRow[];
}) {
  return (
    <section className="border-t border-line bg-surface" aria-labelledby="marketplace-heading">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
          <div className="min-w-0">
            <h2
              id="marketplace-heading"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem] sm:leading-tight"
            >
              {section.heading}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">{section.body}</p>

            <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {['Domain Rating', 'Organic Traffic', 'Referring Domains', 'Price'].map((filter) => (
                <li key={filter} className="flex items-center gap-2 text-[14px] text-ink-soft">
                  <Check className="h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                  {filter}
                </li>
              ))}
            </ul>

            <Button asChild variant="accent" size="lg" className="mt-7">
              <Link href={section.ctaHref}>
                {section.ctaLabel}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            {section.note ? <p className="mt-3 text-[13px] text-muted">{section.note}</p> : null}
          </div>

          <div className="min-w-0">
            <RedactedPreview rows={rows} />
          </div>
        </div>
      </Container>
    </section>
  );
}

/**
 * Questions and answers.
 *
 * Open, not an accordion. The structured data claims the answers are on the
 * page, and an answer behind a click is a weaker claim than one that is simply
 * there - on an article of this length there is no room being saved by hiding
 * them anyway.
 */
export function PostFaqs({ faqs }: { faqs: BlogFaq[] }) {
  return (
    <section className="border-t border-line bg-white" aria-labelledby="faq-heading">
      <Container size="wide" className="py-14 lg:py-16">
        <div className="mx-auto max-w-2xl">
          <h2
            id="faq-heading"
            className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl"
          >
            Frequently asked questions
          </h2>

          <dl className="mt-8 space-y-7">
            {faqs.map((faq) => (
              <div key={faq.question} className="border-b border-line pb-7 last:border-0 last:pb-0">
                <dt className="text-[16px] font-semibold text-ink">{faq.question}</dt>
                <dd className="mt-2.5 text-[15px] leading-relaxed text-muted">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

/** The closing call to action, which every post carries unless it opts out. */
export function PostCta({ section }: { section: BlogCtaSection }) {
  const hasSecondary = Boolean(section.secondaryLabel && section.secondaryHref);

  return (
    <section className="bg-navy-950 text-white">
      <Container size="wide" className="py-14 text-center lg:py-20">
        <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
          {section.heading}
        </h2>
        {section.body ? (
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            {section.body}
          </p>
        ) : null}

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href={section.primaryHref}>{section.primaryLabel}</Link>
          </Button>
          {/* A second button with no label is a box with nothing in it. */}
          {hasSecondary ? (
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href={section.secondaryHref}>{section.secondaryLabel}</Link>
            </Button>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
