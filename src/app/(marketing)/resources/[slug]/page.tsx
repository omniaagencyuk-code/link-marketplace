import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/blog/post-card';
import { Markdown, markdownToPlainText, readingTime } from '@/lib/cms/markdown';
import { blogService } from '@/lib/services/blog-service';
import { categoryName } from '@/lib/config/blog';
import { formatDate } from '@/lib/utils/format';
import { brand, siteUrl } from '@/lib/config/brand';

/**
 * A blog post.
 *
 * Rendered per request rather than pre-generated, because posts are editable
 * and schedulable: a scheduled post has to become visible on its date without
 * a deploy.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await blogService.getPublishedBySlug(slug);
  if (!post) return { title: 'Article not found', robots: { index: false, follow: true } };

  const description = post.seoDescription || post.excerpt || markdownToPlainText(post.body, 155);

  return {
    title: post.seoTitle || post.title,
    description,
    alternates: { canonical: `/resources/${post.slug}` },
    openGraph: {
      title: post.seoTitle || post.title,
      description,
      url: `${siteUrl}/resources/${post.slug}`,
      type: 'article',
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      ...(post.coverImage?.src
        ? { images: [{ url: post.coverImage.src, alt: post.coverImage.alt }] }
        : {}),
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await blogService.getPublishedBySlug(slug);
  if (!post) notFound();

  const related = await blogService.getRelated(slug, 3);
  const description = post.seoDescription || post.excerpt;

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Organization', name: post.author || brand.name },
    publisher: { '@type': 'Organization', name: brand.name, url: siteUrl },
    mainEntityOfPage: `${siteUrl}/resources/${post.slug}`,
    ...(post.coverImage?.src ? { image: post.coverImage.src } : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'Resources', item: `${siteUrl}/resources` },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${siteUrl}/resources/${post.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <article>
        <header className="border-b border-line bg-white">
          <Container size="wide" className="py-10 lg:py-14">
            <nav aria-label="Breadcrumb" className="mb-6">
              <ol className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                <li>
                  <Link href="/" className="hover:text-ink">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/resources" className="hover:text-ink">
                    Resources
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-ink-soft">{categoryName(post.category)}</li>
              </ol>
            </nav>

            <div className="max-w-3xl">
              <Link
                href={`/resources?category=${post.category}`}
                className="text-[11px] font-semibold tracking-[0.12em] text-accent-700 uppercase hover:underline"
              >
                {categoryName(post.category)}
              </Link>

              <h1 className="mt-4 text-[2rem] leading-[1.12] font-semibold tracking-tight text-ink sm:text-[2.75rem]">
                {post.title}
              </h1>

              {post.excerpt ? (
                <p className="mt-4 text-[17px] leading-relaxed text-muted">{post.excerpt}</p>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                <span className="font-medium text-ink-soft">{post.author}</span>
                <span aria-hidden="true">&middot;</span>
                <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                <span aria-hidden="true">&middot;</span>
                <span>{readingTime(post.body)}</span>
              </div>
            </div>
          </Container>
        </header>

        {post.coverImage?.src ? (
          <Container size="wide" className="pt-8">
            {/* eslint-disable-next-line @next/next/no-img-element --
                editor-supplied paths, including external ones. */}
            <img
              src={post.coverImage.src}
              alt={post.coverImage.alt}
              className="max-h-[26rem] w-full rounded-[var(--radius-card)] border border-line object-cover"
            />
          </Container>
        ) : null}

        <Container size="wide" className="py-10 lg:py-14">
          <div className="mx-auto max-w-2xl">
            <Markdown source={post.body} variant="article" />
          </div>

          <div className="mx-auto mt-12 max-w-2xl border-t border-line pt-8">
            <Link
              href="/resources"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-700 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              All resources
            </Link>
          </div>
        </Container>
      </article>

      {related.length ? (
        <section className="border-t border-line bg-surface" aria-labelledby="related-heading">
          <Container size="wide" className="py-14">
            <h2 id="related-heading" className="text-[15px] font-semibold text-ink">
              Keep reading
            </h2>
            <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((entry) => (
                <li key={entry.id}>
                  <PostCard post={entry} />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}

      <section className="bg-navy-950 text-white">
        <Container size="wide" className="py-14 text-center lg:py-20">
          <h2 className="mx-auto max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Put it into practice
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
            Create a free account and search thousands of vetted publishers in a few minutes.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup">Create Free Account</Link>
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
