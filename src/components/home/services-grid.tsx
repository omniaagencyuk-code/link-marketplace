import Link from 'next/link';
import { ArrowRight, FileEdit, Megaphone, PenLine, Newspaper, type LucideIcon } from 'lucide-react';
import { Container } from '@/components/layout/container';
import type { ContentAccessors } from '@/lib/cms/resolve';
import type { LinkValue } from '@/lib/cms/types';

/**
 * The four things Press Parrot sells.
 *
 * Each card links to its own SEO landing page rather than straight into the
 * marketplace, so a signed-out visitor gets a page that explains the product
 * before being asked to register.
 *
 * Icons and accent colours are fixed and matched by position - four cards in a
 * row only reads well when they are visually consistent.
 */
const icons: LucideIcon[] = [Newspaper, FileEdit, PenLine, Megaphone];
const accents = [
  'bg-accent-50 text-accent-700',
  'bg-blue-50 text-blue-700',
  'bg-amber-50 text-amber-700',
  'bg-coral-50 text-coral-700',
];

export function ServicesGrid({ content }: { content: ContentAccessors }) {
  const services = content.list<{ title: string; body: string; cta: LinkValue }>(
    'services',
    'items',
  );

  return (
    <section className="border-b border-line bg-white" aria-labelledby="services-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="services-heading"
            className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            {content.text('services', 'heading')}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            {content.text('services', 'intro')}
          </p>
        </div>

        <ul data-reveal-items="" className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => {
            const Icon = icons[index % icons.length] as LucideIcon;
            const cta = service.cta ?? { label: 'Learn more', href: '/' };
            return (
              <li
                key={service.title || index}
                /*
                  One hover state for the whole card, so the arrow moves when
                  the card is pointed at rather than only when the link is.
                  The lift is half a pixel of translate and a shadow - both
                  compositor properties, neither of them layout.
                */
                className="group relative flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-300 hover:shadow-[var(--shadow-raised)]"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${accents[index % accents.length]}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold text-ink">{service.title}</h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{service.body}</p>
                {/*
                  The link covers the card. Still one link with the same anchor
                  text and the same destination - the span is what a pointer
                  hits, not a second thing to crawl.
                */}
                <span className="mt-5 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-accent-700">
                  <Link href={cta.href} className="after:absolute after:inset-0">
                    {cta.label}
                  </Link>
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
