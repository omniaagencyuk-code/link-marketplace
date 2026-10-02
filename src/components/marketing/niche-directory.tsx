import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { nicheName } from '@/lib/data/categories';
import { NICHE_COPY } from '@/lib/content/niche-guest-posts';
import { publishedNiches } from '@/lib/services/niche-landing';
import type { NicheSlug } from '@/lib/types';

/**
 * Every niche with a page of its own.
 *
 * The public way into the marketplace now that the inventory itself needs an
 * account: a visitor who cannot be shown a domain can still be shown which
 * subjects we carry and sent to the one they care about.
 *
 * iGaming is listed and is deliberately not listed first. It is a real part of
 * the business and gets the same page as everything else, but a general link
 * building marketplace that leads with gambling reads as a gambling
 * marketplace to the people who are not buying it - which is most of them.
 */
export async function NicheDirectory() {
  const niches = await publishedNiches();
  if (niches.length === 0) return null;

  const ordered = [
    ...niches.filter((slug) => slug !== 'igaming'),
    ...niches.filter((slug) => slug === 'igaming'),
  ];

  return (
    <section className="border-b border-line bg-surface">
      <Container size="wide" className="py-14 lg:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Guest posts by subject</h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          What each kind of publisher will take, what it costs, and how many of them we have. Open
          a subject to see a sample of the listings.
        </p>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((slug) => (
            <li key={slug}>
              <Link
                href={`/guest-posts/${slug}`}
                className="group block h-full rounded-[var(--radius-card)] border border-line bg-white p-5 transition-colors hover:border-line-strong"
              >
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink group-hover:text-accent-700">
                  {nicheName(slug as NicheSlug)}
                  <ArrowRight
                    className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </span>
                <span className="mt-1.5 block text-[13px] leading-snug text-muted">
                  {NICHE_COPY[slug as NicheSlug]?.audience}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
