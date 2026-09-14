import Image from 'next/image';
import { Star } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Avatar } from '@/components/ui/avatar';
import { customerLogos, testimonials } from '@/lib/config/social-proof';
import { initialsFromName } from '@/lib/utils/format';

/**
 * Social proof.
 *
 * Both halves are driven by `src/lib/config/social-proof.ts`, which ships
 * empty. Until real, permissioned logos and quotes are added, the section
 * renders obvious placeholders rather than implying customers or endorsements
 * that do not exist.
 */
export function TrustedBy() {
  const testimonial = testimonials[0];

  return (
    <section className="border-b border-line bg-white py-12 lg:py-14" aria-label="Social proof">
      <Container size="wide">
        <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:gap-14">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
              Trusted by SEOs worldwide
            </h2>

            {customerLogos.length > 0 ? (
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
            ) : (
              <LogoPlaceholders />
            )}
          </div>

          {testimonial ? (
            <figure className="rounded-xl border border-line bg-surface p-6 shadow-[var(--shadow-card)]">
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
          ) : (
            <TestimonialPlaceholder />
          )}
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

/** Neutral logo slots - deliberately nameless, so nothing is implied. */
function LogoPlaceholders() {
  return (
    <div>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <li
            key={index}
            className="flex h-12 items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface"
          >
            <span className="h-2.5 w-16 rounded-full bg-line-strong/70" aria-hidden="true" />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted">
        Customer logos coming soon. Add them in{' '}
        <code className="font-mono text-[11px]">src/lib/config/social-proof.ts</code>.
      </p>
    </div>
  );
}

function TestimonialPlaceholder() {
  return (
    <figure className="rounded-xl border border-dashed border-line-strong bg-surface p-6">
      <Stars rating={0} />
      <p className="mt-3 text-[15px] leading-relaxed text-muted italic">
        Your first customer quote will appear here.
      </p>
      <figcaption className="mt-4 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-10 w-10 rounded-full border border-dashed border-line-strong bg-white"
        />
        <div>
          <p className="h-2.5 w-24 rounded-full bg-line-strong/70" aria-hidden="true" />
          <p className="mt-1.5 h-2.5 w-16 rounded-full bg-line-strong/50" aria-hidden="true" />
        </div>
      </figcaption>
      <p className="mt-4 text-[12px] text-muted">
        Placeholder. Add a real, attributable quote in{' '}
        <code className="font-mono text-[11px]">src/lib/config/social-proof.ts</code>.
      </p>
    </figure>
  );
}
