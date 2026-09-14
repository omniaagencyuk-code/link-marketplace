import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, FileText, Languages, Search, Users } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/shared/faq';
import { MonsteraLeaf } from '@/components/shared/foliage';
import { HandwrittenNote } from '@/components/shared/handwritten';
import { settingsService } from '@/lib/services';
import { isPricingConfigured, pricingTable } from '@/lib/services/content-pricing';
import { contentTypes, wordCountOptions } from '@/lib/config/content';
import { formatPrice } from '@/lib/utils/format';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * Public content writing service page.
 *
 * Has its own layout rather than the shared `ServicePage` because pricing is
 * the centre of it, and prices come from settings rather than from copy. When
 * no price has been configured the table shows "on request" instead of a
 * number - an unset price is never rendered as free or invented.
 */

export const metadata: Metadata = {
  title: 'SEO content writing services',
  description:
    'Order SEO content writing without buying a placement. Articles, blog posts, guest posts, landing pages and website copy, briefed by you and written to rank and read well.',
  alternates: { canonical: '/content-writing' },
  openGraph: {
    title: `SEO content writing services | ${brand.name}`,
    description:
      'SEO articles, blog posts, guest posts and landing page copy, ordered on their own or alongside a placement.',
    url: `${siteUrl}/content-writing`,
  },
};

const highlights = [
  {
    icon: Search,
    title: 'Briefed from the search results',
    body: 'We start from what already ranks for your keyword and what it fails to answer, not from a blank page.',
  },
  {
    icon: Users,
    title: 'Written for readers too',
    body: 'Content that only satisfies a checklist tends to satisfy nobody. Structure serves the argument, not the other way round.',
  },
  {
    icon: FileText,
    title: 'No placement required',
    body: 'Order content on its own. You do not have to buy a backlink to get an article written.',
  },
  {
    icon: Languages,
    title: 'UK and US English',
    body: 'Choose the variant per article. More languages are planned; the ordering flow already accounts for them.',
  },
];

const faqs = [
  {
    question: 'Can I order content without buying a backlink?',
    answer:
      'Yes. Content ordering is a standalone service. You can order articles, blog posts, landing pages or website copy without buying any placement, and you can order a placement without ordering content.',
  },
  {
    question: 'What does SEO content writing cost?',
    answer:
      'Pricing is set per word count and content type. The table on this page shows current prices; where a length is not listed we quote it before any writing begins.',
  },
  {
    question: 'How do revisions work?',
    answer:
      'Every article can be sent back for revision from your dashboard with notes on what needs changing. The request goes straight to the writer and you can see the status of it throughout.',
  },
  {
    question: 'Can you write guest posts for a specific publisher?',
    answer:
      'Yes. Tell us the publisher and we will write to their editorial requirements, whether or not you buy the placement through Press Parrot.',
  },
  {
    question: 'Who writes the content?',
    answer:
      'Our in-house writing team and a small vetted pool of specialist freelancers for technical niches. You are told which brief went to which writer inside your order.',
  },
  {
    question: 'Do you use AI to write the articles?',
    answer:
      'Articles are written and edited by people. Where research tools are used, a writer is still responsible for the argument, the accuracy and the final draft.',
  },
];

export default async function ContentWritingPage() {
  const settings = await settingsService.get();
  const pricing = settings.contentPricing;
  const configured = isPricingConfigured(pricing);
  const rows = pricingTable(pricing, [500, 1000, 1500, 2000]);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Content writing',
        item: `${siteUrl}/content-writing`,
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className="tropical-wash relative overflow-hidden border-b border-line bg-white">
        <MonsteraLeaf className="pointer-events-none absolute -top-16 -right-16 hidden w-72 rotate-[18deg] opacity-25 lg:block" />
        <Container size="wide" className="relative py-12 lg:py-20">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center gap-2 text-[12px] text-muted">
              <li>
                <Link href="/" className="hover:text-ink">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink-soft">Content writing</li>
            </ol>
          </nav>

          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase">
              SEO content writing
            </p>
            <h1 className="mt-4 text-[2.25rem] leading-[1.08] font-semibold tracking-tight text-ink sm:text-5xl">
              SEO Content Written for Rankings, Links and Real Readers
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted lg:text-[17px]">
              Order professionally written SEO content without buying a placement. Brief the article
              once, choose the length and tone, and get something you would be happy to publish
              under your own name.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href="/dashboard/content/new">
                  Order Content
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="#how-it-works">How It Works</Link>
              </Button>
            </div>

            <p className="mt-4 text-[13px] text-muted">
              Free account &middot; No subscription &middot; No placement required
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-12 lg:py-16">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((highlight) => (
              <div key={highlight.title}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                  <highlight.icon className="h-4.5 w-4.5" aria-hidden="true" />
                </span>
                <h2 className="mt-4 text-[15px] font-semibold text-ink">{highlight.title}</h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{highlight.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface" aria-labelledby="content-types">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2
              id="content-types"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              What we write
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              Five content types cover most of what an SEO campaign needs. If yours is not on the
              list, describe it in the brief and we will scope it.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {contentTypes
              .filter((type) => type.slug !== 'other')
              .map((type) => (
                <article
                  key={type.slug}
                  className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)]"
                >
                  <h3 className="text-[16px] font-semibold text-ink">{type.label}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{type.description}</p>
                  <p className="mt-4 text-[12px] font-medium text-accent-700">{type.typicalWords}</p>
                </article>
              ))}
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white" aria-labelledby="pricing">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="max-w-2xl">
            <h2
              id="pricing"
              className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
            >
              Content pricing
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {configured
                ? 'Fixed prices by length. Longer or more specialised pieces are quoted before any writing begins.'
                : 'Prices are set per length and confirmed before any writing begins. Tell us what you need and we will quote it.'}
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((row) => (
              <div
                key={row.words}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
              >
                <p className="text-[13px] font-medium text-muted">
                  {row.words.toLocaleString(brand.locale)} words
                </p>
                <p className="mt-1.5 text-xl font-semibold tracking-tight text-ink">
                  {row.priceMinor === null
                    ? 'On request'
                    : formatPrice(row.priceMinor, { currency: settings.currency })}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 max-w-3xl rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <p className="text-[13px] font-medium text-muted">Custom length</p>
            <p className="mt-1.5 text-[15px] text-ink">
              Any length from 500 to 3,000 words is available in the order form, and anything beyond
              that is quoted individually.
            </p>
          </div>

          <p className="mt-4 text-[13px] text-muted">
            Available lengths: {wordCountOptions.map((words) => words.toLocaleString(brand.locale)).join(', ')}{' '}
            or custom.
          </p>
        </Container>
      </section>

      <section className="border-b border-line bg-surface" id="how-it-works">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
            <div className="min-w-0 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight">
                How ordering content works
              </h2>

              <ol className="mt-8 space-y-7">
                {[
                  {
                    step: '01',
                    title: 'Create a free account',
                    body: 'No subscription and no minimum. You only pay for what you order.',
                  },
                  {
                    step: '02',
                    title: 'Brief the article',
                    body: 'Topic, target keyword, word count, tone, audience and anything the writer should know. Attach a brief document if you have one.',
                  },
                  {
                    step: '03',
                    title: 'Add it to your order',
                    body: 'Queue several articles before checking out - three 1,000 word pieces, or a mix of lengths and types.',
                  },
                  {
                    step: '04',
                    title: 'Review and approve',
                    body: 'Read the draft in your dashboard, request a revision if it needs one, and download the final article.',
                  },
                ].map((entry) => (
                  <li key={entry.step} className="flex gap-5">
                    <span className="text-[13px] font-semibold text-accent-600 tabular">
                      {entry.step}
                    </span>
                    <div>
                      <h3 className="text-[16px] font-semibold text-ink">{entry.title}</h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{entry.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <Button asChild variant="accent" size="lg" className="mt-9">
                <Link href="/dashboard/content/new">
                  Order Content
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <aside className="lg:pt-4">
              <HandwrittenNote arrow="down-right" className="mb-4 hidden lg:block">
                No filler. No fluff.
              </HandwrittenNote>
              <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
                <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
                  Every article includes
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {[
                    'Keyword-led structure and headings',
                    'Your target URL and anchor placed naturally',
                    'Internal link suggestions where relevant',
                    'A meta title and description',
                    'One round of revisions as standard',
                  ].map((item) => (
                    <li key={item} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-soft">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="mx-auto max-w-3xl space-y-10">
            <article>
              <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                Content and link building work better together
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                A link points at a page. If that page does not answer the question the reader
                arrived with, the link has done its job and the page has wasted it. This is the
                most common reason a link building campaign underperforms: the target pages were
                never strong enough to hold a ranking once they got there.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Ordering content and{' '}
                <Link href="/link-building" className="text-accent-700 hover:underline">
                  link building
                </Link>{' '}
                through the same account keeps the two aligned. The article that goes out as a{' '}
                <Link href="/guest-posts" className="text-accent-700 hover:underline">
                  guest post
                </Link>{' '}
                can be briefed against the same keyword as the page it links to, and the page
                itself can be strengthened at the same time.
              </p>
            </article>

            <article>
              <h2 className="text-[1.375rem] font-semibold tracking-tight text-ink sm:text-2xl">
                What good SEO content looks like now
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Keyword density stopped being a useful target a long time ago. What matters is
                whether a page covers the subject properly: the main question, the follow-up
                questions, the comparisons a reader will want, and the caveats an expert would
                mention.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                We brief every article from the search results for its target keyword, which shows
                both what is expected and what everyone currently ranking has left out. The second
                of those is usually where the opportunity is.
              </p>
            </article>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="mx-auto max-w-3xl">
            <Faq items={faqs} />
          </div>
        </Container>
      </section>

      <section className="bg-navy-950 text-white">
        <Container size="wide" className="py-14 text-center lg:py-20">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Order your first article
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            Create a free account, brief the piece and we will take it from there.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/dashboard/content/new">
                Order Content
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/marketplace">Explore the marketplace</Link>
            </Button>
          </div>
        </Container>
      </section>
    </>
  );
}
