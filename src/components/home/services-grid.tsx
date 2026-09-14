import Link from 'next/link';
import { ArrowRight, FileEdit, Megaphone, PenLine, Newspaper } from 'lucide-react';
import { Container } from '@/components/layout/container';

/**
 * The four things Press Parrot sells.
 *
 * Each card links to its own SEO landing page rather than straight into the
 * marketplace, so a signed-out visitor gets a page that explains the product
 * before being asked to register.
 */
const services = [
  {
    icon: Newspaper,
    title: 'Guest Posts',
    body: 'Get contextual backlinks through original articles published on relevant websites.',
    cta: 'Explore Guest Posts',
    href: '/guest-posts',
    accent: 'bg-accent-50 text-accent-700',
  },
  {
    icon: FileEdit,
    title: 'Niche Edits',
    body: 'Add contextual links to relevant existing content on established websites.',
    cta: 'Explore Niche Edits',
    href: '/niche-edits',
    accent: 'bg-blue-50 text-blue-700',
  },
  {
    icon: PenLine,
    title: 'Content Writing',
    body: 'Order SEO-focused articles, guest posts and website content from our writing team.',
    cta: 'Order Content',
    href: '/content-writing',
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    icon: Megaphone,
    title: 'Digital PR',
    body: 'Build brand visibility and authority through editorial coverage and digital PR opportunities.',
    cta: 'Explore Digital PR',
    href: '/digital-pr',
    accent: 'bg-coral-50 text-coral-700',
  },
];

export function ServicesGrid() {
  return (
    <section className="border-b border-line bg-white" aria-labelledby="services-heading">
      <Container size="wide" className="py-14 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="services-heading"
            className="text-2xl font-semibold tracking-tight text-ink sm:text-[2rem] sm:leading-tight"
          >
            Everything You Need to Build Better Links
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            From content to placements, Press Parrot gives you the tools, services and support to
            rank higher.
          </p>
        </div>

        <ul className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <li
              key={service.title}
              className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]"
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${service.accent}`}
              >
                <service.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-[17px] font-semibold text-ink">{service.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{service.body}</p>
              <Link
                href={service.href}
                className="mt-5 inline-flex items-center gap-1.5 self-start rounded-lg border border-line-strong bg-white px-3.5 py-2 text-[13px] font-medium text-ink transition-colors hover:border-accent-500 hover:text-accent-700"
              >
                {service.cta}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
