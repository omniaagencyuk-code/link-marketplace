import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check, Search, Send } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/shared/faq';
import { NICHE_COPY } from '@/lib/content/niche-guest-posts';
import { nicheLanding, publishedNiches } from '@/lib/services/niche-landing';
import { nicheName } from '@/lib/data/categories';
import { blogService } from '@/lib/services/blog-service';
import { brand, siteUrl } from '@/lib/config/brand';
import type { NicheSlug } from '@/lib/types';

/**
 * A public page about one niche's inventory.
 *
 * The marketplace itself is account-only, so these pages carry the job the
 * gated pages used to do badly: being the thing a search engine can read and a
 * stranger can judge us by. Everything on them is either written copy or a
 * figure read from the database at request time - and the sample table is
 * built from `SampleRow`, which has no field that could hold a domain, so
 * there is nothing identifying in the HTML, in the RSC payload, or anywhere
 * else a determined reader might look.
 *
 * Deliberately not targeting "link building": that is the homepage's term, and
 * two of our own pages competing for it helps nobody.
 */

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return (await publishedNiches()).map((niche) => ({ niche }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ niche: string }>;
}): Promise<Metadata> {
  const { niche } = await params;
  const copy = NICHE_COPY[niche as NicheSlug];
  if (!copy) return {};

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: `/guest-posts/${niche}` },
    openGraph: {
      title: `${copy.metaTitle} | ${brand.name}`,
      description: copy.metaDescription,
      url: `${siteUrl}/guest-posts/${niche}`,
    },
  };
}

export default async function NicheGuestPostsPage({
  params,
}: {
  params: Promise<{ niche: string }>;
}) {
  const { niche } = await params;
  const copy = NICHE_COPY[niche as NicheSlug];
  if (!copy) notFound();

  const landing = await nicheLanding(niche as NicheSlug);
  // Too few listings to describe honestly. A 404 beats a page that promises an
  // inventory and shows four rows of it.
  if (!landing) notFound();

  const [others, posts]: [
    NicheSlug[],
    Awaited<ReturnType<typeof blogService.listPublished>>,
  ] = await Promise.all([
    publishedNiches(),
    blogService.listPublished({ limit: 3 }).catch(() => []),
  ]);

  const { stats, samples } = landing;
  const signup = `/signup?next=${encodeURIComponent(`/marketplace?niche=${niche}`)}`;

  /*
    FAQPage schema, built from the same answers the page renders.

    Built from `copy.faqs` rather than written out again, because schema that
    disagrees with the visible page is a structured-data penalty waiting to
    happen and is the kind of thing nobody notices for a year.
  */
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // The content is ours, from a typed object, and never from a request.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <section className="tropical-wash border-b border-line bg-white">
        <Container size="wide" className="py-14 lg:py-20">
          <nav aria-label="Breadcrumb" className="mb-4 text-[13px] text-muted">
            <Link href="/guest-posts" className="hover:text-ink">
              Guest posts
            </Link>
            <span className="mx-1.5">/</span>
            <span className="text-ink">{nicheName(niche as NicheSlug)}</span>
          </nav>

          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {copy.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
            {copy.intro}
          </p>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            {copy.audience}
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={signup}>
                Sign up free to see all {stats.listings} domains
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            Free account · No subscription · Pay only for what you order
          </p>
        </Container>
      </section>

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-10">
          <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: "Live listings", value: String(stats.listings) },
              {
                label: "Domain rating",
                value: `DR ${stats.drMin}-${stats.drMax}`,
              },
              { label: "Markets covered", value: String(stats.countries) },
              { label: "From", value: stats.startingPrice },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="text-[12px] tracking-wide text-muted uppercase">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-ink">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            A sample of what is listed
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            Ten of the {stats.listings}{" "}
            {nicheName(niche as NicheSlug).toLowerCase()} publishers in the
            marketplace, across the range of ratings and prices. Domains are
            shown to account holders.
          </p>

          <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-line">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Sample {nicheName(niche as NicheSlug)} publishers, with domains
                withheld
              </caption>
              <thead className="bg-surface">
                <tr>
                  {["Publisher", "DR", "Traffic", "Market", "Price"].map(
                    (head) => (
                      <th
                        key={head}
                        scope="col"
                        className="px-4 py-2.5 text-[11px] font-semibold tracking-wide text-muted uppercase"
                      >
                        {head}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {samples.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <td className="px-4 py-3 text-[14px] font-medium text-ink">
                      {row.label}
                    </td>
                    <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                      {row.domainRating}
                    </td>
                    <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                      {row.traffic}
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink-soft">
                      {row.country}
                    </td>
                    <td className="tabular px-4 py-3 text-[14px] text-ink-soft">
                      {row.price}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <Button asChild>
              <Link href={signup}>
                See all {stats.listings} domains
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Browse",
                body: `Filter the ${nicheName(niche as NicheSlug).toLowerCase()} listings by domain rating, organic traffic, market and price. Every figure is the publisher's real one.`,
              },
              {
                icon: Send,
                title: "Order",
                body: "Pick a placement and send us the article, or have it written. You pay the price shown, with no retainer and no minimum.",
              },
              {
                icon: Check,
                title: "Publish",
                body: "We handle the publisher. You get the live URL when it goes up, and the link stays there.",
              },
            ].map((step, index) => (
              <li key={step.title}>
                <step.icon
                  className="h-5 w-5 text-accent-600"
                  aria-hidden="true"
                />
                <h3 className="mt-3 text-[15px] font-semibold text-ink">
                  {index + 1}. {step.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section className="border-b border-line bg-white">
        <Container size="wide" className="py-14">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            {nicheName(niche as NicheSlug)} guest posts: common questions
          </h2>
          <div className="mt-6 max-w-3xl">
            <Faq
              items={copy.faqs.map((faq) => ({
                question: faq.question,
                answer: faq.answer,
              }))}
            />
          </div>
        </Container>
      </section>

      <section className="border-b border-line bg-surface">
        <Container size="wide" className="py-12">
          <h2 className="text-[15px] font-semibold text-ink">Other niches</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others
              .filter((slug) => slug !== niche)
              .map((slug) => (
                <li key={slug}>
                  <Link
                    href={`/guest-posts/${slug}`}
                    className="inline-flex rounded-full border border-line bg-white px-3 py-1.5 text-[13px] text-ink-soft hover:text-ink"
                  >
                    {nicheName(slug)}
                  </Link>
                </li>
              ))}
          </ul>

          {posts.length > 0 ? (
            <>
              <h2 className="mt-10 text-[15px] font-semibold text-ink">
                Worth reading
              </h2>
              <ul className="mt-4 space-y-2">
                {posts.map((post) => (
                  <li key={post.slug}>
                    <Link
                      href={`/resources/${post.slug}`}
                      className="text-[14px] text-ink-soft underline hover:text-ink"
                    >
                      {post.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Container>
      </section>
    </>
  );
}
