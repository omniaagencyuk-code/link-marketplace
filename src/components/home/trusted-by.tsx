import Image from 'next/image';
import { Star } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { customerLogos, testimonials } from '@/lib/config/social-proof';
import { initialsFromName } from '@/lib/utils/format';

/**
 * Social proof.
 *
 * Driven by `src/lib/config/social-proof.ts`, which ships empty because real,
 * permissioned logos and attributable quotes are the only kind worth showing.
 *
 * With nothing to show, the section renders nothing at all. It used to render
 * dashed placeholders explaining which file to edit, which is a note to a
 * developer sitting on the homepage of a live business - worse than an absent
 * section, because it says the product has no customers *and* looks unfinished.
 *
 * Each half stands alone: logos without a quote, or a quote without logos,
 * both lay out properly. Nothing here implies an endorsement that does not
 * exist, and there is no placeholder state to forget to remove.
 */
export function TrustedBy() {
  const testimonial = testimonials[0];
  const hasLogos = customerLogos.length > 0;

  if (!hasLogos && !testimonial) return null;

  return (
    <section className="border-b border-line bg-white py-12 lg:py-14" aria-label="Social proof">
      <Container size="wide">
        <div
          className={
            hasLogos && testimonial
              ? 'grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-14'
              : 'grid gap-10'
          }
        >
          {hasLogos ? (
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                Trusted by SEOs worldwide
              </h2>
              <ul className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-6">
                {customerLogos.map((logo) => (
                  <li key={logo.name}>
                    <Image
                      src={logo.src}
                      alt={logo.name}
                      width={logo.width ?? 120}
                      height={32}
                      className="h-7 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {testimonial ? (
            <figure
              className={
                hasLogos
                  ? 'rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]'
                  : 'mx-auto max-w-2xl rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]'
              }
            >
              <Stars rating={testimonial.rating} />
              <blockquote className="mt-3 text-[15px] leading-relaxed text-ink-soft italic">
                &ldquo;{testimonial.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 flex items-center gap-3">
                {testimonial.avatarSrc ? (
                  <Image
                    src={testimonial.avatarSrc}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <Avatar initials={initialsFromName(testimonial.authorName)} className="h-10 w-10" />
                )}
                <div>
                  <p className="text-[13px] font-semibold text-ink">{testimonial.authorName}</p>
                  <p className="text-[12px] text-muted">{testimonial.authorRole}</p>
                </div>
              </figcaption>
            </figure>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={
            index < rating ? 'h-4 w-4 fill-accent-500 text-accent-500' : 'h-4 w-4 text-line-strong'
          }
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
