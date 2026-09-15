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

        <ul className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => {
            const Icon = icons[index % icons.length] as LucideIcon;
            const cta = service.cta ?? { label: 'Learn more', href: '/' };
            return (
              <li
                key={service.title || index}
                className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${accents[index % accents.length]}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[17px] font-semibold text-ink">{service.title}</h3>
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{service.body}</p>
                <Link
                  href={cta.href}
                  className="mt-5 inline-flex items-center gap-1.5 self-start rounded-lg border border-line-strong bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-accent-500 hover:text-accent-700"
                >
                  {cta.label}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
