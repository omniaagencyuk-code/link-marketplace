import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen, Mail, MessageSquare } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { PageHero } from '@/components/layout/page-hero';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { brand } from '@/lib/config/brand';
import { formatDate } from '@/lib/utils/format';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'Guides, benchmarks and playbooks on link building, guest posting, niche edits and digital PR from the Press Parrot team.',
  alternates: { canonical: '/resources' },
};

const guides = [
  {
    category: 'Playbook',
    title: 'How to build a link plan that survives a Google core update',
    excerpt:
      'A practical framework for spreading link acquisition across pages, anchors and publication types so a single algorithm change cannot undo six months of work.',
    readingTime: '11 min read',
    publishedAt: '2026-08-18',
  },
  {
    category: 'Benchmarks',
    title: 'What link placements actually cost in 2026',
    excerpt:
      'Median prices across 5,000 vetted websites, broken down by domain rating band, niche and country, with notes on where prices moved most this year.',
    readingTime: '8 min read',
    publishedAt: '2026-07-30',
  },
  {
    category: 'Guide',
    title: 'Guest post vs niche edit: choosing the right product per page',
    excerpt:
      'When a new article beats an insertion, how indexation age affects results, and the anchor strategy differences between the two products.',
    readingTime: '9 min read',
    publishedAt: '2026-07-02',
  },
  {
    category: 'Guide',
    title: 'Vetting a publisher in ten minutes',
    excerpt:
      'The checks our editorial team runs before a website is listed, and how to run a lighter version of the same process on any site you are offered elsewhere.',
    readingTime: '7 min read',
    publishedAt: '2026-06-14',
  },
  {
    category: 'Playbook',
    title: 'Digital PR for regulated niches',
    excerpt:
      'How gambling, finance and crypto brands earn coverage on mainstream publications without breaking advertising rules or wasting budget on nofollow mentions.',
    readingTime: '13 min read',
    publishedAt: '2026-05-21',
  },
  {
    category: 'Benchmarks',
    title: 'Anchor text distribution across 40,000 placements',
    excerpt:
      'What ratios of branded, partial match and exact match anchors look like on sites that rank, based on placements ordered through the marketplace.',
    readingTime: '10 min read',
    publishedAt: '2026-04-09',
  },
];

export default function ResourcesPage() {
  return (
    <>
      <PageHero
        eyebrow="Resources"
        title="Link building, written down"
        description="Benchmarks, playbooks and vetting guidance from the team that reviews every website on the marketplace."
      />

      <section className="border-b border-line bg-white py-14 lg:py-18">
        <Container size="wide">
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {guides.map((guide) => (
              <li key={guide.title}>
                <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{guide.category}</Badge>
                    <span className="text-[12px] text-muted">{guide.readingTime}</span>
                  </div>
                  <h2 className="mt-3 text-[16px] leading-snug font-semibold text-ink">
                    {guide.title}
                  </h2>
                  <p className="mt-2 flex-1 text-[13px] leading-relaxed text-muted">
                    {guide.excerpt}
                  </p>
                  <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
                    <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Published {formatDate(guide.publishedAt)}
                  </p>
                </article>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[13px] text-muted">
            Article pages are not part of this release. Each guide will get its own indexable URL
            when the content library ships.
          </p>
        </Container>
      </section>

      <section id="contact" className="scroll-mt-24 bg-surface py-14 lg:py-18">
        <Container size="wide">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                <MessageSquare className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-[17px] font-semibold text-ink">Talk to the team</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                Planning a campaign, need bulk pricing or want a shortlist built for you? Send us
                the target pages and we will come back with a plan.
              </p>
              <Button asChild className="mt-5" variant="primary">
                <a href={`mailto:${brand.salesEmail}`}>
                  <Mail className="h-4 w-4" />
                  {brand.salesEmail}
                </a>
              </Button>
            </div>

            <div className="rounded-xl border border-line bg-white p-6 shadow-[var(--shadow-card)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-900 text-white">
                <ArrowRight className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-[17px] font-semibold text-ink">Start browsing</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                The fastest way to understand the marketplace is to use it. Filter by your niche,
                set a budget and see exactly what is available today.
              </p>
              <Button asChild className="mt-5" variant="outline">
                <Link href="/websites">Browse websites</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
