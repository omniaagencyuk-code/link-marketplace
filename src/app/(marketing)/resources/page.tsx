import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Mail } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PostCard } from '@/components/blog/post-card';
import { blogService } from '@/lib/services/blog-service';
import { postCategories, categoryName } from '@/lib/config/blog';
import { brand, siteUrl } from '@/lib/config/brand';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Guides and playbooks on link building, SEO, content and digital PR from the Press Parrot team.',
  alternates: { canonical: '/resources' },
  openGraph: {
    title: `Resources | ${brand.name}`,
    description: 'Guides and playbooks on link building, SEO, content and digital PR.',
    url: `${siteUrl}/resources`,
  },
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requested = typeof params.category === 'string' ? params.category : undefined;
  const category = postCategories.find((entry) => entry.slug === requested)?.slug;

  const [posts, counts] = await Promise.all([
    blogService.listPublished(category ? { category } : {}),
    blogService.countByCategory(),
  ]);

  const [lead, ...rest] = posts;

  return (
    <>
      <PageHero
        eyebrow="Resources"
        title={category ? categoryName(category) : 'Link building, without the folklore'}
        description={
          category
            ? postCategories.find((entry) => entry.slug === category)?.description
            : 'Practical guides on link building, SEO, content and digital PR. Written by the people who run the marketplace, not by a content farm.'
        }
      />

      <Container size="wide" className="py-10 lg:py-14">
        <nav aria-label="Categories" className="flex flex-wrap gap-2">
          <CategoryPill href="/resources" label="All" active={!category} count={posts.length && !category ? posts.length : undefined} />
          {postCategories.map((entry) => (
            <CategoryPill
              key={entry.slug}
              href={`/resources?category=${entry.slug}`}
              label={entry.name}
              active={category === entry.slug}
              count={counts[entry.slug]}
            />
          ))}
        </nav>

        {posts.length === 0 ? (
          <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-white px-6 py-16 text-center">
            <BookOpen className="mx-auto h-6 w-6 text-muted" aria-hidden="true" />
            <h2 className="mt-4 text-[16px] font-semibold text-ink">Nothing here yet</h2>
            <p className="mt-1.5 text-[14px] text-muted">
              {category ? 'No posts in this category yet.' : 'The first articles are on their way.'}
            </p>
          </div>
        ) : (
          <>
            {lead ? (
              <div className="mt-10">
                <PostCard post={lead} featured />
              </div>
            ) : null}

            {rest.length ? (
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
                  <li key={post.id}>
                    <PostCard post={post} />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Container>

      <section id="contact" className="border-t border-line bg-surface">
        <Container size="wide" className="py-14 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <Badge tone="accent">Contact</Badge>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Got a question the guides do not answer?
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
                Tell us what you are trying to achieve and we will tell you honestly whether Press
                Parrot is the right fit.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Button asChild variant="accent" size="lg">
                <Link href={`mailto:${brand.salesEmail}`}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Email the team
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/signup">
                  Create free account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function CategoryPill({
  href,
  label,
  active,
  count,
}: {
  href: string;
  label: string;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-3.5 py-1.5 text-[13px] font-medium text-white'
          : 'inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-accent-500 hover:text-accent-700'
      }
    >
      {label}
      {count ? <span className="tabular text-[11px] opacity-60">{count}</span> : null}
    </Link>
  );
}
