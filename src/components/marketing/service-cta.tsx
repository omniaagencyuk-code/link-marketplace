import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/cms/reveal';
import { Float } from '@/components/marketing/page-motion';
import type { Animation } from '@/lib/cms/sections';

const FADE_UP: Animation = { entrance: 'fade-up', speed: 'normal', delay: 'none' };

/**
 * The band at the foot of a redrawn service page.
 *
 * One copy, for the same reason `OrderSteps` is one copy: /link-building and
 * /niche-edits end the same way, with the same two buttons into the same
 * marketplace. Its words are not here - the heading, the body and both links
 * come from the page's own CMS content and are passed in.
 */
export function ServiceCta({
  heading,
  body,
  primary,
  secondary,
}: {
  heading: string;
  body: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
}) {
  return (
    <section className="relative overflow-hidden bg-accent-50">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(40rem 24rem at 50% 120%, rgba(16,185,129,0.22) 0%, transparent 65%)',
        }}
      />

      <Container size="wide" className="relative py-16 text-center lg:py-24">
        <Reveal animation={FADE_UP}>
          <div>
            {/* Decorative: the words below say everything it says. */}
            <Float seconds={7} className="mx-auto w-fit">
              <Image
                src="/images/parrots/gambling-parrot.webp"
                alt=""
                width={160}
                height={160}
                aria-hidden="true"
                className="h-20 w-20 object-contain"
              />
            </Float>

            <h2 className="mx-auto mt-6 max-w-2xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {heading}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">{body}</p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href={primary.href}>
                  {primary.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href={secondary.href}>{secondary.label}</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
